using System;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;

namespace SalesCrm.Plugins
{
    public sealed class OpportunityRules : IPlugin
    {
        private readonly string prefix;
        private readonly Guid[] historyWriters;
        private readonly HistoryPermit historyPermit;

        public OpportunityRules(string configuration, string secureConfiguration)
        {
            var parts = (configuration ?? "").Split('|');
            if (!Regex.IsMatch(parts[0], "^[a-z][a-z0-9]{1,7}$"))
                throw new InvalidPluginExecutionException("CRM publisher prefix is required.");
            prefix = parts[0] + "_";
            historyPermit = new HistoryPermit(prefix, secureConfiguration);
            historyWriters = new Guid[parts.Length - 1];
            for (var i = 1; i < parts.Length; i++)
                if (!Guid.TryParse(parts[i], out historyWriters[i - 1]))
                    throw new InvalidPluginExecutionException("CRM history writer step ID is invalid.");
        }

        public void Execute(IServiceProvider services)
        {
            var context = (IPluginExecutionContext)services.GetService(typeof(IPluginExecutionContext));
            if (context.PrimaryEntityName == prefix + "crmstagehistory")
            {
                GuardHistory(context, (ITracingService)services.GetService(typeof(ITracingService)));
                return;
            }
            if (context.PrimaryEntityName != prefix + "crmopportunity") return;
            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity))
                throw new InvalidPluginExecutionException("CRM opportunity Target is required.");
            var target = (Entity)context.InputParameters["Target"];
            Entity before = null;
            if (context.MessageName == "Update")
            {
                if (!context.PreEntityImages.Contains("Before"))
                    throw new InvalidPluginExecutionException("CRM Before image is missing.");
                before = context.PreEntityImages["Before"];
            }
            if (context.Stage == 20)
            {
                var stage = Effective<OptionSetValue>(target, before, "stage");
                if (context.MessageName == "Create" && stage == null)
                {
                    stage = new OptionSetValue(100000000);
                    target[prefix + "stage"] = stage;
                }
                var reason = Effective<string>(target, before, "lossreason");
                if (stage != null && stage.Value == 100000004 && string.IsNullOrWhiteSpace(reason))
                    throw new InvalidPluginExecutionException("失注理由を入力してください。");
                if (target.Contains(prefix + "lossreason"))
                    target[prefix + "lossreason"] = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
                var previous = before == null ? null : before.GetAttributeValue<OptionSetValue>(prefix + "stage");
                var changed = stage?.Value != previous?.Value;
                if (stage?.Value == 100000003 || stage?.Value == 100000004)
                {
                    target[prefix + "probability"] = stage.Value == 100000003 ? 100 : 0;
                    if (changed && Effective<DateTime?>(target, before, "actualclosedate") == null)
                        target[prefix + "actualclosedate"] = DateTime.UtcNow.Date;
                    else if (changed && previous != null &&
                             (previous.Value == 100000003 || previous.Value == 100000004) &&
                             !target.Contains(prefix + "actualclosedate"))
                        target[prefix + "actualclosedate"] = DateTime.UtcNow.Date;
                }
                else if (changed && before != null)
                    target[prefix + "actualclosedate"] = null;
                return;
            }
            if (context.Stage != 40 || !context.IsInTransaction)
                throw new InvalidPluginExecutionException("CRM history must run in the opportunity transaction.");
            if (!context.PostEntityImages.Contains("After"))
                throw new InvalidPluginExecutionException("CRM After image is missing.");
            var after = context.PostEntityImages["After"];
            var oldStage = before?.GetAttributeValue<OptionSetValue>(prefix + "stage");
            var newStage = after.GetAttributeValue<OptionSetValue>(prefix + "stage");
            if (oldStage?.Value == newStage?.Value) return;
            var history = new Entity(prefix + "crmstagehistory", Guid.NewGuid());
            history[prefix + "name"] = "Stage change";
            history[prefix + "opportunityid"] = new EntityReference(context.PrimaryEntityName, context.PrimaryEntityId);
            history[prefix + "fromstage"] = oldStage;
            history[prefix + "tostage"] = newStage;
            history[prefix + "lossreason"] = newStage?.Value == 100000004
                ? after.GetAttributeValue<string>(prefix + "lossreason") : null;
            history["ownerid"] = after.GetAttributeValue<EntityReference>("ownerid");
            var factory = (IOrganizationServiceFactory)services.GetService(typeof(IOrganizationServiceFactory));
            // Caller context preserves Dataverse privileges and trusted createdby/createdon.
            history[prefix + "historypermit"] =
                historyPermit.Sign(history, context.CorrelationId, context.UserId, DateTime.UtcNow);
            factory.CreateOrganizationService(context.UserId).Create(history);
        }

        private T Effective<T>(Entity target, Entity before, string suffix)
        {
            var name = prefix + suffix;
            return target.Contains(name) ? target.GetAttributeValue<T>(name)
                : before == null ? default(T) : before.GetAttributeValue<T>(name);
        }

        private void GuardHistory(IPluginExecutionContext context, ITracingService tracing)
        {
            if (context.MessageName == "Create" && context.Stage == 20 && context.IsInTransaction &&
                context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity target &&
                target.Id != Guid.Empty)
            {
                if (target.Contains(prefix + "historypermit") &&
                    target[prefix + "historypermit"] is string permit &&
                    historyPermit.Verify(permit, target, context.CorrelationId, context.UserId, DateTime.UtcNow))
                {
                    // The request proof is consumed before Dataverse persists the row.
                    target.Attributes.Remove(prefix + "historypermit");
                    return;
                }
            }
            // Dataverse inserts a stage-30 context between the child request and its calling plugin.
            for (var parent = context.ParentContext; parent != null; parent = parent.ParentContext)
            {
                if (parent.PrimaryEntityName != prefix + "crmopportunity") continue;
                if (context.MessageName == "Delete" && parent.MessageName == "Delete") return;
                if (context.MessageName == "Update" &&
                    (parent.MessageName == "Assign" || parent.MessageName == "Update") &&
                    context.InputParameters["Target"] is Entity assignment &&
                    assignment.Contains("ownerid") && assignment.Attributes.Count == 1)
                    return;
            }
            // Log routing metadata only; never include attribute values or business text.
            TraceContext(tracing, context);
            for (var parent = context.ParentContext; parent != null; parent = parent.ParentContext)
                TraceContext(tracing, parent);
            tracing.Trace("CRM history guard configured writer steps: {0}", string.Join(",", historyWriters));
            throw new InvalidPluginExecutionException("進捗履歴は商談更新時に自動記録されるため、直接変更できません。");
        }

        private static void TraceContext(ITracingService tracing, IPluginExecutionContext context)
        {
            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as Entity : null;
            tracing.Trace(
                "CRM history guard: correlation={0}; entity={1}; message={2}; stage={3}; depth={4}; " +
                "transaction={5}; primaryId={6}; step={7}; user={8}; initiatingUser={9}; " +
                "targetEntity={10}; targetId={11}; targetColumns={12}",
                context.CorrelationId, context.PrimaryEntityName, context.MessageName, context.Stage,
                context.Depth, context.IsInTransaction, context.PrimaryEntityId,
                context.OwningExtension?.Id, context.UserId, context.InitiatingUserId,
                target?.LogicalName, target?.Id,
                target == null ? "" : string.Join(",", target.Attributes.Keys));
        }
    }
}
