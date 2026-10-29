using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.Remoting.Messaging;
using System.Runtime.Remoting.Proxies;
using Microsoft.Xrm.Sdk;
using SalesCrm.Plugins;

internal static class Program
{
    private static int checks;

    private static void Check(bool condition, string name)
    {
        if (!condition) throw new Exception(name);
        checks++;
        Console.WriteLine("PASS: " + name);
    }

    private static void Main()
    {
        var permit = new HistoryPermit("test_", Convert.ToBase64String(new byte[32]));
        var other = new HistoryPermit("test_", Convert.ToBase64String(new byte[32] {
            1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 }));
        var now = DateTime.UtcNow;
        var correlation = Guid.NewGuid();
        var caller = Guid.NewGuid();
        var history = new Entity("test_crmstagehistory", Guid.NewGuid());
        history["test_name"] = "Stage change";
        history["test_opportunityid"] = new EntityReference("test_crmopportunity", Guid.NewGuid());
        history["ownerid"] = new EntityReference("systemuser", caller);
        history["test_fromstage"] = new OptionSetValue(100000000);
        history["test_tostage"] = new OptionSetValue(100000001);
        history["test_lossreason"] = null;
        var tag = permit.Sign(history, correlation, caller, now);
        Check(permit.Verify(tag, history, correlation, caller, now), "Valid server signature");
        Check(!other.Verify(tag, history, correlation, caller, now), "Wrong key rejected");
        Check(!permit.Verify(tag, history, Guid.NewGuid(), caller, now), "Other transaction rejected");
        Check(!permit.Verify(tag, history, correlation, Guid.NewGuid(), now), "Other caller rejected");
        Check(!permit.Verify(tag, history, correlation, caller, now.AddMinutes(6)), "Expired signature rejected");
        Check(!permit.Verify(tag, history, correlation, caller, now.AddSeconds(-1)), "Future signature rejected");
        foreach (var field in new[] { "test_name", "test_opportunityid", "ownerid",
                                      "test_fromstage", "test_tostage", "test_lossreason" })
        {
            var value = history[field];
            history[field] = value is OptionSetValue ? (object)new OptionSetValue(100000004) :
                value is EntityReference reference ? new EntityReference(reference.LogicalName, Guid.NewGuid()) :
                (object)"Tampered";
            Check(!permit.Verify(tag, history, correlation, caller, now), "Tampered " + field + " rejected");
            history[field] = value;
        }
        var id = history.Id;
        history.Id = Guid.NewGuid();
        Check(!permit.Verify(tag, history, correlation, caller, now), "Other history ID rejected");
        history.Id = id;
        history.LogicalName = "test_other";
        Check(!permit.Verify(tag, history, correlation, caller, now), "Other table rejected");
        history.LogicalName = "test_crmstagehistory";
        foreach (var invalid in new[] { "", "caller-approved", "crm-history-v1:0:fake",
                                        "crm-history-v1:no-date:fake", tag + "x" })
            Check(!permit.Verify(invalid, history, correlation, caller, now), "Forged tag rejected");
        history["createdon"] = now;
        Check(permit.Verify(tag, history, correlation, caller, now), "Platform system columns tolerated");
        history.Attributes.Remove("test_lossreason");
        Check(permit.Verify(tag, history, correlation, caller, now), "Omitted null field normalized");
        var context = new ContextProxy();
        context.Values["PrimaryEntityName"] = history.LogicalName;
        context.Values["MessageName"] = "Create";
        context.Values["Stage"] = 20;
        context.Values["IsInTransaction"] = true;
        context.Values["CorrelationId"] = correlation;
        context.Values["UserId"] = caller;
        context.Values["InputParameters"] = new ParameterCollection { { "Target", history } };
        context.Values["SharedVariables"] = new ParameterCollection { { "tag", "existing-mcp-tag" } };
        history["test_historypermit"] = tag;
        var plugin = new OpportunityRules("test", Convert.ToBase64String(new byte[32]));
        var services = new Services((IPluginExecutionContext)context.GetTransparentProxy());
        plugin.Execute(services);
        Check(true, "Signed history permitted with no writer or ParentContext");
        Check(!history.Contains("test_historypermit"), "Request proof stripped before persistence");
        Check((string)((ParameterCollection)context.Values["SharedVariables"])["tag"] == "existing-mcp-tag",
            "Existing MCP tag untouched");
        var mcp = new ContextProxy();
        mcp.Values["MessageName"] = "McpUpdateRecord";
        context.Values["ParentContext"] = (IPluginExecutionContext)mcp.GetTransparentProxy();
        history["test_historypermit"] = tag;
        plugin.Execute(services);
        Check(true, "Signed history permitted with truncated MCP parent");
        history["test_historypermit"] = "forged";
        Reject(plugin, services, "MCP name alone cannot authorize history");
        history.Attributes.Remove("test_historypermit");
        context.Values["SharedVariables"] = new ParameterCollection { { "tag", tag } };
        Reject(plugin, services, "Valid tag without request-proof column rejected");
        history["test_historypermit"] = tag;
        context.Values["IsInTransaction"] = false;
        Reject(plugin, services, "Valid signature outside transaction rejected");
        context.Values["IsInTransaction"] = true;
        context.Values["MessageName"] = "Update";
        Reject(plugin, services, "Valid signature cannot authorize direct history update");
        context.Values["MessageName"] = "Delete";
        Reject(plugin, services, "Valid signature cannot authorize direct history delete");
        var writer = new ContextProxy();
        writer.Values["PrimaryEntityName"] = "test_crmopportunity";
        writer.Values["PrimaryEntityId"] = Guid.NewGuid();
        writer.Values["MessageName"] = "Update";
        writer.Values["Stage"] = 40;
        writer.Values["IsInTransaction"] = true;
        writer.Values["CorrelationId"] = correlation;
        writer.Values["UserId"] = caller;
        writer.Values["InputParameters"] = new ParameterCollection {
            { "Target", new Entity("test_crmopportunity") } };
        var before = new Entity("test_crmopportunity");
        before["test_stage"] = new OptionSetValue(100000000);
        var after = new Entity("test_crmopportunity");
        after["test_stage"] = new OptionSetValue(100000001);
        after["ownerid"] = new EntityReference("systemuser", caller);
        writer.Values["PreEntityImages"] = new EntityImageCollection { { "Before", before } };
        writer.Values["PostEntityImages"] = new EntityImageCollection { { "After", after } };
        writer.Values["SharedVariables"] = new ParameterCollection { { "tag", "existing-mcp-tag" } };
        var organization = new OrganizationProxy(created => {
            Check(created.Contains("test_historypermit"), "Writer carries signature in Target column");
            context.Values["MessageName"] = "Create";
            context.Values["SharedVariables"] = new ParameterCollection { { "tag", "existing-mcp-tag" } };
            context.Values["InputParameters"] = new ParameterCollection { { "Target", created } };
            plugin.Execute(services);
            Check(!created.Contains("test_historypermit"), "Child guard consumes actual writer proof");
            return created.Id;
        });
        plugin.Execute(new Services((IPluginExecutionContext)writer.GetTransparentProxy(),
            new Factory(caller, (IOrganizationService)organization.GetTransparentProxy())));
        Check(true, "Writer uses Create without tag request or SharedVariables mutation");
        Console.WriteLine("PASS: " + checks + " signature checks");
    }

    private static void Reject(IPlugin plugin, IServiceProvider services, string name)
    {
        try { plugin.Execute(services); }
        catch (InvalidPluginExecutionException) { Check(true, name); return; }
        throw new Exception(name);
    }

    private sealed class ContextProxy : RealProxy
    {
        internal readonly Dictionary<string, object> Values = new Dictionary<string, object>();
        internal ContextProxy() : base(typeof(IPluginExecutionContext))
        {
            Values["InputParameters"] = new ParameterCollection();
            Values["SharedVariables"] = new ParameterCollection();
        }
        public override IMessage Invoke(IMessage message)
        {
            var call = (IMethodCallMessage)message;
            var method = (MethodInfo)call.MethodBase;
            var property = method.Name.Substring(4);
            if (!Values.TryGetValue(property, out var value))
                value = method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
            return new ReturnMessage(value, null, 0, call.LogicalCallContext, call);
        }
    }

    private sealed class Services : IServiceProvider, ITracingService
    {
        private readonly IPluginExecutionContext context;
        private readonly IOrganizationServiceFactory factory;
        internal Services(IPluginExecutionContext context, IOrganizationServiceFactory factory = null)
        {
            this.context = context;
            this.factory = factory;
        }
        public object GetService(Type type)
        {
            if (type == typeof(IPluginExecutionContext)) return context;
            if (type == typeof(ITracingService)) return this;
            if (type == typeof(IOrganizationServiceFactory) && factory != null) return factory;
            throw new InvalidOperationException("Unexpected service " + type);
        }
        public void Trace(string format, params object[] args) { }
    }

    private sealed class OrganizationProxy : RealProxy
    {
        private readonly Func<Entity, Guid> create;
        internal OrganizationProxy(Func<Entity, Guid> create) : base(typeof(IOrganizationService))
        {
            this.create = create;
        }
        public override IMessage Invoke(IMessage message)
        {
            var call = (IMethodCallMessage)message;
            if (call.MethodName != "Create")
                throw new Exception("Unexpected organization request: " + call.MethodName);
            return new ReturnMessage(create((Entity)call.Args[0]), null, 0, call.LogicalCallContext, call);
        }
    }

    private sealed class Factory : IOrganizationServiceFactory
    {
        private readonly Guid caller;
        private readonly IOrganizationService service;
        internal Factory(Guid caller, IOrganizationService service)
        {
            this.caller = caller;
            this.service = service;
        }
        public IOrganizationService CreateOrganizationService(Guid? userId)
        {
            Check(userId == caller, "Writer retains caller identity");
            return service;
        }
    }
}
