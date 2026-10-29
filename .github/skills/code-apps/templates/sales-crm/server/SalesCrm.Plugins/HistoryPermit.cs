using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace SalesCrm.Plugins
{
    internal sealed class HistoryPermit
    {
        private readonly string prefix;
        private readonly byte[] key;

        internal HistoryPermit(string prefix, string secureConfiguration)
        {
            this.prefix = prefix;
            if (string.IsNullOrWhiteSpace(secureConfiguration))
                throw new InvalidPluginExecutionException("CRM history signing secure configuration is required.");
            key = Convert.FromBase64String(secureConfiguration);
            if (key.Length != 32)
                throw new InvalidPluginExecutionException("CRM history signing key must be 256 bits.");
        }

        internal string Sign(Entity history, Guid correlation, Guid caller, DateTime now)
        {
            var ticks = now.Ticks.ToString(CultureInfo.InvariantCulture);
            return "crm-history-v1:" + ticks + ":" +
                Convert.ToBase64String(Mac(history, correlation, caller, ticks));
        }

        internal bool Verify(string tag, Entity history, Guid correlation, Guid caller, DateTime now)
        {
            var parts = tag.Split(':');
            if (parts.Length != 3 || parts[0] != "crm-history-v1" || history.Id == Guid.Empty ||
                history.LogicalName != prefix + "crmstagehistory" ||
                !long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks) ||
                ticks > now.Ticks || now.Ticks - ticks > TimeSpan.FromMinutes(5).Ticks)
                return false;
            var expected = Convert.ToBase64String(Mac(history, correlation, caller, parts[1]));
            if (parts[2].Length != expected.Length) return false;
            var difference = 0;
            for (var i = 0; i < expected.Length; i++)
                difference |= parts[2][i] ^ expected[i];
            return difference == 0;
        }

        private byte[] Mac(Entity history, Guid correlation, Guid caller, string ticks)
        {
            var text = new StringBuilder();
            foreach (var value in new[] {
                "crm-history-v1", ticks, history.LogicalName, history.Id.ToString("D"),
                correlation.ToString("D"), caller.ToString("D"),
                history.GetAttributeValue<string>(prefix + "name"),
                Reference(history.GetAttributeValue<EntityReference>(prefix + "opportunityid")),
                Reference(history.GetAttributeValue<EntityReference>("ownerid")),
                Choice(history.GetAttributeValue<OptionSetValue>(prefix + "fromstage")),
                Choice(history.GetAttributeValue<OptionSetValue>(prefix + "tostage")),
                history.GetAttributeValue<string>(prefix + "lossreason") })
            {
                text.Append(value == null ? "-1:" :
                    Encoding.UTF8.GetByteCount(value).ToString(CultureInfo.InvariantCulture) + ":" + value);
            }
            using (var hmac = new HMACSHA256(key))
                return hmac.ComputeHash(Encoding.UTF8.GetBytes(text.ToString()));
        }

        private static string Reference(EntityReference reference)
        {
            return reference == null ? null : reference.LogicalName + ":" + reference.Id.ToString("D");
        }

        private static string Choice(OptionSetValue choice)
        {
            return choice?.Value.ToString(CultureInfo.InvariantCulture);
        }
    }
}
