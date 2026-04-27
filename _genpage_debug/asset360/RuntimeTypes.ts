// ---------------- Type Definitions which can be imported from ./RuntimeTypes -------------------------
export interface TableRegistrations extends BaseTableRegistrations {
    "bookableresource": bookableresource,
    "bookableresourcebooking": bookableresourcebooking,
    "incident": incident,
    "msdyn_customerasset": msdyn_customerasset,
    "msdyn_incidenttype": msdyn_incidenttype,
    "msdyn_iotalert": msdyn_iotalert,
    "msdyn_iotdevice": msdyn_iotdevice,
    "msdyn_workorder": msdyn_workorder,
    "msdyn_workorderservicetask": msdyn_workorderservicetask,
}
export interface EnumRegistrations extends BaseEnumRegistrations {
    "bookableresource-msdyn_crewstrategy": bookableresource_msdyn_crewstrategy,
    "bookableresource-msdyn_derivecapacity": bookableresource_msdyn_derivecapacity,
    "bookableresource-msdyn_displayonscheduleassistant": bookableresource_msdyn_displayonscheduleassistant,
    "bookableresource-msdyn_displayonscheduleboard": bookableresource_msdyn_displayonscheduleboard,
    "bookableresource-msdyn_enableappointments": bookableresource_msdyn_enableappointments,
    "bookableresource-msdyn_enabledforfieldservicemobile": bookableresource_msdyn_enabledforfieldservicemobile,
    "bookableresource-msdyn_enabledripscheduling": bookableresource_msdyn_enabledripscheduling,
    "bookableresource-msdyn_enableoutlookschedules": bookableresource_msdyn_enableoutlookschedules,
    "bookableresource-msdyn_endlocation": bookableresource_msdyn_endlocation,
    "bookableresource-msdyn_generictype": bookableresource_msdyn_generictype,
    "bookableresource-msdyn_pooltype": bookableresource_msdyn_pooltype,
    "bookableresource-msdyn_startlocation": bookableresource_msdyn_startlocation,
    "bookableresource-msdyn_timeoffapprovalrequired": bookableresource_msdyn_timeoffapprovalrequired,
    "bookableresource-resourcetype": bookableresource_resourcetype,
    "bookableresource-statecode": bookableresource_statecode,
    "bookableresource-statuscode": bookableresource_statuscode,
    "bookableresourcebooking-bookingtype": bookableresourcebooking_bookingtype,
    "bookableresourcebooking-msdyn_acceptcascadecrewchanges": bookableresourcebooking_msdyn_acceptcascadecrewchanges,
    "bookableresourcebooking-msdyn_allowoverlapping": bookableresourcebooking_msdyn_allowoverlapping,
    "bookableresourcebooking-msdyn_bookingmethod": bookableresourcebooking_msdyn_bookingmethod,
    "bookableresourcebooking-msdyn_cascadecrewchanges": bookableresourcebooking_msdyn_cascadecrewchanges,
    "bookableresourcebooking-msdyn_crewmembertype": bookableresourcebooking_msdyn_crewmembertype,
    "bookableresourcebooking-msdyn_preventtimestampcreation": bookableresourcebooking_msdyn_preventtimestampcreation,
    "bookableresourcebooking-msdyn_quickNoteAction": bookableresourcebooking_msdyn_quickNoteAction,
    "bookableresourcebooking-msdyn_traveltimecalculationtype": bookableresourcebooking_msdyn_traveltimecalculationtype,
    "bookableresourcebooking-msdyn_traveltimerescheduling": bookableresourcebooking_msdyn_traveltimerescheduling,
    "bookableresourcebooking-msdyn_worklocation": bookableresourcebooking_msdyn_worklocation,
    "bookableresourcebooking-rcwr_activitytype": bookableresourcebooking_rcwr_activitytype,
    "bookableresourcebooking-statecode": bookableresourcebooking_statecode,
    "bookableresourcebooking-statuscode": bookableresourcebooking_statuscode,
    "incident-activitiescomplete": incident_activitiescomplete,
    "incident-blockedprofile": incident_blockedprofile,
    "incident-caseorigincode": incident_caseorigincode,
    "incident-casetypecode": incident_casetypecode,
    "incident-checkemail": incident_checkemail,
    "incident-contractservicelevelcode": incident_contractservicelevelcode,
    "incident-customercontacted": incident_customercontacted,
    "incident-customersatisfactioncode": incident_customersatisfactioncode,
    "incident-decremententitlementterm": incident_decremententitlementterm,
    "incident-firstresponsesent": incident_firstresponsesent,
    "incident-firstresponseslastatus": incident_firstresponseslastatus,
    "incident-followuptaskcreated": incident_followuptaskcreated,
    "incident-incidentstagecode": incident_incidentstagecode,
    "incident-isdecrementing": incident_isdecrementing,
    "incident-isescalated": incident_isescalated,
    "incident-merged": incident_merged,
    "incident-messagetypecode": incident_messagetypecode,
    "incident-msdyn_casesentiment": incident_msdyn_casesentiment,
    "incident-msdyn_copilotengaged": incident_msdyn_copilotengaged,
    "incident-prioritycode": incident_prioritycode,
    "incident-resolvebyslastatus": incident_resolvebyslastatus,
    "incident-routecase": incident_routecase,
    "incident-servicestage": incident_servicestage,
    "incident-severitycode": incident_severitycode,
    "incident-statecode": incident_statecode,
    "incident-statuscode": incident_statuscode,
    "msdyn_customerasset-msdyn_alert": msdyn_customerasset_msdyn_alert,
    "msdyn_customerasset-msdyn_registrationstatus": msdyn_customerasset_msdyn_registrationstatus,
    "msdyn_customerasset-statecode": msdyn_customerasset_statecode,
    "msdyn_customerasset-statuscode": msdyn_customerasset_statuscode,
    "msdyn_incidenttype-msdyn_copyincidentitemstoagreement": msdyn_incidenttype_msdyn_copyincidentitemstoagreement,
    "msdyn_incidenttype-msdyn_resolutionrequiredonwocompletion": msdyn_incidenttype_msdyn_resolutionrequiredonwocompletion,
    "msdyn_incidenttype-statecode": msdyn_incidenttype_statecode,
    "msdyn_incidenttype-statuscode": msdyn_incidenttype_statuscode,
    "msdyn_iotalert-msdyn_alerttype": msdyn_iotalert_msdyn_alerttype,
    "msdyn_iotalert-msdyn_suggestedpriority": msdyn_iotalert_msdyn_suggestedpriority,
    "msdyn_iotalert-statecode": msdyn_iotalert_statecode,
    "msdyn_iotalert-statuscode": msdyn_iotalert_statuscode,
    "msdyn_iotdevice-msdyn_connectionstate": msdyn_iotdevice_msdyn_connectionstate,
    "msdyn_iotdevice-msdyn_issimulated": msdyn_iotdevice_msdyn_issimulated,
    "msdyn_iotdevice-msdyn_registrationstatus": msdyn_iotdevice_msdyn_registrationstatus,
    "msdyn_iotdevice-statecode": msdyn_iotdevice_statecode,
    "msdyn_iotdevice-statuscode": msdyn_iotdevice_statuscode,
    "msdyn_workorder-msdyn_followuprequired": msdyn_workorder_msdyn_followuprequired,
    "msdyn_workorder-msdyn_isfollowup": msdyn_workorder_msdyn_isfollowup,
    "msdyn_workorder-msdyn_ismobile": msdyn_workorder_msdyn_ismobile,
    "msdyn_workorder-msdyn_systemstatus": msdyn_workorder_msdyn_systemstatus,
    "msdyn_workorder-msdyn_taxable": msdyn_workorder_msdyn_taxable,
    "msdyn_workorder-msdyn_worklocation": msdyn_workorder_msdyn_worklocation,
    "msdyn_workorder-rcwr_css": msdyn_workorder_rcwr_css,
    "msdyn_workorder-rcwr_iso": msdyn_workorder_rcwr_iso,
    "msdyn_workorder-statecode": msdyn_workorder_statecode,
    "msdyn_workorder-statuscode": msdyn_workorder_statuscode,
    "msdyn_workorderservicetask-msdyn_inspectionenabled": msdyn_workorderservicetask_msdyn_inspectionenabled,
    "msdyn_workorderservicetask-msdyn_inspectionresult": msdyn_workorderservicetask_msdyn_inspectionresult,
    "msdyn_workorderservicetask-msdyn_inspectiontaskresult": msdyn_workorderservicetask_msdyn_inspectiontaskresult,
    "msdyn_workorderservicetask-statecode": msdyn_workorderservicetask_statecode,
    "msdyn_workorderservicetask-statuscode": msdyn_workorderservicetask_statuscode,
}
export type bookableresource = TableRow<{
    // Primary Key Column
    readonly bookableresourceid: string,
    // Foreign Key Column
    readonly _accountid_value: `/account(${string})`,
    readonly accountidname: string,
    readonly accountidyominame: string,
    // Foreign Key Column
    readonly _calendarid_value: `/calendar(${string})`,
    readonly calendaridname: string,
    // Foreign Key Column
    readonly _contactid_value: `/contact(${string})`,
    readonly contactidname: string,
    readonly contactidyominame: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly exchangerate: number,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    msdyn_bookingstodrip: number,
    msdyn_crewstrategy: bookableresource_msdyn_crewstrategy,
    msdyn_derivecapacity: bookableresource_msdyn_derivecapacity,
    msdyn_displayonscheduleassistant: bookableresource_msdyn_displayonscheduleassistant,
    msdyn_displayonscheduleboard: bookableresource_msdyn_displayonscheduleboard,
    msdyn_enableappointments: bookableresource_msdyn_enableappointments,
    msdyn_enabledforfieldservicemobile: bookableresource_msdyn_enabledforfieldservicemobile,
    msdyn_enabledripscheduling: bookableresource_msdyn_enabledripscheduling,
    msdyn_enableoutlookschedules: bookableresource_msdyn_enableoutlookschedules,
    msdyn_endlocation: bookableresource_msdyn_endlocation,
    msdyn_generictype: bookableresource_msdyn_generictype,
    msdyn_hourlyrate: number,
    readonly msdyn_hourlyrate_base: number,
    msdyn_internalflags: string,
    msdyn_latitude: number,
    msdyn_locationtimestamp: Date,
    msdyn_longitude: number,
    msdyn_optimalcrewsize: number,
    // Foreign Key Column
    readonly _msdyn_organizationalunit_value: `/msdyn_organizationalunit(${string})`,
    readonly msdyn_organizationalunitname: string,
    msdyn_pooltype: bookableresource_msdyn_pooltype,
    msdyn_primaryemail: string,
    msdyn_startlocation: bookableresource_msdyn_startlocation,
    msdyn_targetutilization: number,
    msdyn_timeoffapprovalrequired: bookableresource_msdyn_timeoffapprovalrequired,
    // Foreign Key Column
    readonly _msdyn_warehouse_value: `/msdyn_warehouse(${string})`,
    readonly msdyn_warehousename: string,
    name: string,
    readonly owningbusinessunitname: string,
    processid: string,
    readonly resourcetype: bookableresource_resourcetype,
    stageid: string,
    statecode: bookableresource_statecode,
    statuscode: bookableresource_statuscode,
    timezone: number,
    // Foreign Key Column
    readonly _transactioncurrencyid_value: `/transactioncurrency(${string})`,
    readonly transactioncurrencyidname: string,
    traversedpath: string,
    // Foreign Key Column
    readonly _userid_value: `/systemuser(${string})`,
    readonly useridname: string,
    readonly useridyominame: string,
}>

export type bookableresourcebooking = TableRow<{
    // Primary Key Column
    readonly bookableresourcebookingid: string,
    // Foreign Key Column
    readonly _bookingstatus_value: `/bookingstatus(${string})`,
    readonly bookingstatusname: string,
    bookingtype: bookableresourcebooking_bookingtype,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    duration: number,
    endtime: Date,
    readonly exchangerate: number,
    // Foreign Key Column
    readonly _header_value: `/bookableresourcebookingheader(${string})`,
    readonly headername: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    msdyn_acceptcascadecrewchanges: bookableresourcebooking_msdyn_acceptcascadecrewchanges,
    msdyn_actualarrivaltime: Date,
    msdyn_actualtravelduration: number,
    // Foreign Key Column
    readonly _msdyn_agreementbookingdate_value: `/msdyn_agreementbookingdate(${string})`,
    readonly msdyn_agreementbookingdatename: string,
    msdyn_allowoverlapping: bookableresourcebooking_msdyn_allowoverlapping,
    // Foreign Key Column
    readonly _msdyn_appointmentbookingid_value: `/appointment(${string})`,
    readonly msdyn_appointmentbookingidname: string,
    msdyn_basetravelduration: number,
    msdyn_bookingmethod: bookableresourcebooking_msdyn_bookingmethod,
    // Foreign Key Column
    readonly _msdyn_bookingsetupmetadataid_value: `/msdyn_bookingsetupmetadata(${string})`,
    readonly msdyn_bookingsetupmetadataidname: string,
    msdyn_cascadecrewchanges: bookableresourcebooking_msdyn_cascadecrewchanges,
    // Foreign Key Column
    _msdyn_crew_value: `/bookableresource(${string})`,
    msdyn_crewmembertype: bookableresourcebooking_msdyn_crewmembertype,
    readonly msdyn_crewname: string,
    msdyn_effort: number,
    msdyn_estimatedarrivaltime: Date,
    msdyn_estimatedtravelduration: number,
    msdyn_globalobjectid: string,
    msdyn_internalflags: string,
    msdyn_latitude: number,
    msdyn_longitude: number,
    msdyn_milestraveled: number,
    msdyn_offlinetimestamp: Date,
    msdyn_preventtimestampcreation: bookableresourcebooking_msdyn_preventtimestampcreation,
    msdyn_quickNoteAction: bookableresourcebooking_msdyn_quickNoteAction,
    // Foreign Key Column
    readonly _msdyn_requirementgroupid_value: `/msdyn_requirementgroup(${string})`,
    readonly msdyn_requirementgroupidname: string,
    msdyn_requirementgroupset: string,
    // Foreign Key Column
    _msdyn_resourcegroup_value: `/bookableresource(${string})`,
    readonly msdyn_resourcegroupname: string,
    // Foreign Key Column
    readonly _msdyn_resourcerequirement_value: `/msdyn_resourcerequirement(${string})`,
    readonly msdyn_resourcerequirementname: string,
    msdyn_signature: string,
    msdyn_slottext: string,
    // Foreign Key Column
    readonly _msdyn_timegroupdetailselected_value: `/msdyn_timegroupdetail(${string})`,
    readonly msdyn_timegroupdetailselectedname: string,
    msdyn_totalbillableduration: number,
    msdyn_totalbreakduration: number,
    msdyn_totalcost: number,
    readonly msdyn_totalcost_base: number,
    msdyn_totaldurationinprogress: number,
    msdyn_traveltimecalculationtype: bookableresourcebooking_msdyn_traveltimecalculationtype,
    msdyn_traveltimerescheduling: bookableresourcebooking_msdyn_traveltimerescheduling,
    msdyn_tzaendtime: Date,
    msdyn_tzastarttime: Date,
    msdyn_ursinternalflags: string,
    msdyn_worklocation: bookableresourcebooking_msdyn_worklocation,
    // Foreign Key Column
    _msdyn_workorder_value: `/msdyn_workorder(${string})`,
    readonly msdyn_workordername: string,
    name: string,
    readonly owningbusinessunitname: string,
    processid: string,
    rcwr_activitytype: bookableresourcebooking_rcwr_activitytype,
    readonly rcwr_maintenancereportpdf_name: string,
    rcwr_pendingemailjson: string,
    rcwr_preworkchecklist: string,
    readonly rcwr_preworkconfirmationpdf_name: string,
    rcwr_preworkemailsentat: Date,
    rcwr_reportemailsentat: Date,
    rcwr_reportsignature: string,
    rcwr_signatureskipreason: string,
    // Foreign Key Column
    _resource_value: `/bookableresource(${string})`,
    readonly resourcename: string,
    stageid: string,
    starttime: Date,
    statecode: bookableresourcebooking_statecode,
    statuscode: bookableresourcebooking_statuscode,
    // Foreign Key Column
    readonly _transactioncurrencyid_value: `/transactioncurrency(${string})`,
    readonly transactioncurrencyidname: string,
    traversedpath: string,
}>

export type incident = TableRow<{
    // Primary Key Column
    readonly incidentid: string,
    // Foreign Key Column
    readonly _accountid_value: `/account(${string})`,
    readonly accountidname: string,
    readonly accountidyominame: string,
    activitiescomplete: incident_activitiescomplete,
    actualserviceunits: number,
    billedserviceunits: number,
    readonly blockedprofile: incident_blockedprofile,
    readonly caseage: string,
    caseorigincode: incident_caseorigincode,
    casetypecode: incident_casetypecode,
    checkemail: incident_checkemail,
    // Foreign Key Column
    readonly _contactid_value: `/contact(${string})`,
    readonly contactidname: string,
    readonly contactidyominame: string,
    // Foreign Key Column
    readonly _contractdetailid_value: `/contractdetail(${string})`,
    readonly contractdetailidname: string,
    // Foreign Key Column
    readonly _contractid_value: `/contract(${string})`,
    readonly contractidname: string,
    contractservicelevelcode: incident_contractservicelevelcode,
    // Foreign Key Column
    readonly _createdbyexternalparty_value: `/externalparty(${string})`,
    readonly createdbyexternalpartyname: string,
    readonly createdbyexternalpartyyominame: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly customercontacted: incident_customercontacted,
    // Foreign Key Column
    readonly _customerid_value: `/account(${string})` | `/contact(${string})`,
    readonly customeridname: string,
    customeridtype: string,
    readonly customeridyominame: string,
    customersatisfactioncode: incident_customersatisfactioncode,
    deactivatedon: Date,
    decremententitlementterm: incident_decremententitlementterm,
    description: string,
    emailaddress: string,
    // Foreign Key Column
    readonly _entitlementid_value: `/entitlement(${string})`,
    readonly entitlementidname: string,
    // This is an image encoded as a base64 string
    entityimage: string,
    readonly entityimage_timestamp: number,
    readonly entityimage_url: string,
    readonly entityimageid: string,
    readonly escalatedon: Date,
    readonly exchangerate: number,
    // Foreign Key Column
    _existingcase_value: `/incident(${string})`,
    // Foreign Key Column
    readonly _firstresponsebykpiid_value: `/slakpiinstance(${string})`,
    readonly firstresponsebykpiidname: string,
    firstresponsesent: incident_firstresponsesent,
    firstresponseslastatus: incident_firstresponseslastatus,
    followupby: Date,
    followuptaskcreated: incident_followuptaskcreated,
    incidentstagecode: incident_incidentstagecode,
    readonly influencescore: number,
    isdecrementing: incident_isdecrementing,
    isescalated: incident_isescalated,
    // Foreign Key Column
    readonly _kbarticleid_value: `/kbarticle(${string})`,
    readonly kbarticleidname: string,
    readonly lastinteraction: string,
    lastonholdtime: Date,
    // Foreign Key Column
    _masterid_value: `/incident(${string})`,
    readonly masteridname: string,
    readonly merged: incident_merged,
    readonly messagetypecode: incident_messagetypecode,
    // Foreign Key Column
    readonly _modifiedbyexternalparty_value: `/externalparty(${string})`,
    readonly modifiedbyexternalpartyname: string,
    readonly modifiedbyexternalpartyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _msdyn_aiagentstatus_value: `/msdyn_aiagentstatus(${string})`,
    readonly msdyn_aiagentstatusname: string,
    msdyn_casesentiment: incident_msdyn_casesentiment,
    msdyn_casesurveyinviteurl: string,
    msdyn_copilotengaged: incident_msdyn_copilotengaged,
    // Foreign Key Column
    readonly _msdyn_functionallocation_value: `/msdyn_functionallocation(${string})`,
    readonly msdyn_functionallocationname: string,
    // Foreign Key Column
    _msdyn_incidenttype_value: `/msdyn_incidenttype(${string})`,
    readonly msdyn_incidenttypename: string,
    // Foreign Key Column
    _msdyn_iotalert_value: `/msdyn_iotalert(${string})`,
    readonly msdyn_iotalertname: string,
    msdyn_precreateattachmentsid: string,
    msdyn_precreatenotesid: string,
    nextsla: string,
    readonly numberofchildincidents: number,
    readonly onholdtime: number,
    readonly owningbusinessunitname: string,
    // Foreign Key Column
    _parentcaseid_value: `/incident(${string})`,
    readonly parentcaseidname: string,
    // Foreign Key Column
    readonly _primarycontactid_value: `/contact(${string})`,
    readonly primarycontactidname: string,
    readonly primarycontactidyominame: string,
    prioritycode: incident_prioritycode,
    processid: string,
    // Foreign Key Column
    readonly _productid_value: `/product(${string})`,
    readonly productidname: string,
    productserialnumber: string,
    // Foreign Key Column
    readonly _rcwr_dailyreport_value: `/rcwr_dailyreport(${string})`,
    readonly rcwr_dailyreportname: string,
    resolveby: Date,
    // Foreign Key Column
    readonly _resolvebykpiid_value: `/slakpiinstance(${string})`,
    readonly resolvebykpiidname: string,
    resolvebyslastatus: incident_resolvebyslastatus,
    responseby: Date,
    // Foreign Key Column
    readonly _responsiblecontactid_value: `/contact(${string})`,
    readonly responsiblecontactidname: string,
    readonly responsiblecontactidyominame: string,
    readonly routecase: incident_routecase,
    readonly sentimentvalue: number,
    servicestage: incident_servicestage,
    severitycode: incident_severitycode,
    // Foreign Key Column
    readonly _slaid_value: `/sla(${string})`,
    // Foreign Key Column
    readonly _slainvokedid_value: `/sla(${string})`,
    readonly slainvokedidname: string,
    readonly slaname: string,
    // Foreign Key Column
    readonly _socialprofileid_value: `/socialprofile(${string})`,
    readonly socialprofileidname: string,
    stageid: string,
    statecode: incident_statecode,
    statuscode: incident_statuscode,
    // Foreign Key Column
    readonly _subjectid_value: `/subject(${string})`,
    readonly subjectidname: string,
    readonly ticketnumber: string,
    title: string,
    // Foreign Key Column
    readonly _transactioncurrencyid_value: `/transactioncurrency(${string})`,
    readonly transactioncurrencyidname: string,
    traversedpath: string,
}>

export type msdyn_customerasset = TableRow<{
    // Primary Key Column
    readonly msdyn_customerassetid: string,
    cr377_hinsyu_code: string,
    cr377_kikibangou: string,
    cr377_kisyu_kana: string,
    cr377_kisyukigo: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _msdyn_account_value: `/account(${string})`,
    readonly msdyn_accountname: string,
    readonly msdyn_accountyominame: string,
    readonly msdyn_alert: msdyn_customerasset_msdyn_alert,
    readonly msdyn_alertcount: number,
    readonly msdyn_alertcount_date: Date,
    readonly msdyn_alertcount_state: number,
    msdyn_assettag: string,
    // Foreign Key Column
    readonly _msdyn_customerassetcategory_value: `/msdyn_customerassetcategory(${string})`,
    readonly msdyn_customerassetcategoryname: string,
    msdyn_deviceid: string,
    // Foreign Key Column
    readonly _msdyn_functionallocation_value: `/msdyn_functionallocation(${string})`,
    readonly msdyn_functionallocationname: string,
    readonly msdyn_lastalerttime: Date,
    readonly msdyn_lastalerttime_date: Date,
    readonly msdyn_lastalerttime_state: number,
    // Foreign Key Column
    readonly _msdyn_lastcommandsent_value: `/msdyn_iotdevicecommand(${string})`,
    readonly msdyn_lastcommandsentname: string,
    msdyn_lastcommandsenttime: Date,
    msdyn_latitude: number,
    msdyn_longitude: number,
    msdyn_manufacturingdate: Date,
    // Foreign Key Column
    _msdyn_masterasset_value: `/msdyn_customerasset(${string})`,
    readonly msdyn_masterassetname: string,
    msdyn_name: string,
    // Foreign Key Column
    _msdyn_parentasset_value: `/msdyn_customerasset(${string})`,
    readonly msdyn_parentassetname: string,
    // Foreign Key Column
    readonly _msdyn_product_value: `/product(${string})`,
    readonly msdyn_productname: string,
    msdyn_registrationstatus: msdyn_customerasset_msdyn_registrationstatus,
    // Foreign Key Column
    readonly _msdyn_workorderproduct_value: `/msdyn_workorderproduct(${string})`,
    readonly msdyn_workorderproductname: string,
    readonly owningbusinessunitname: string,
    rcwr_customernum: string,
    // This is an image encoded as a base64 string
    rcwr_photo: string,
    readonly rcwr_photo_timestamp: number,
    readonly rcwr_photo_url: string,
    readonly rcwr_photoid: string,
    statecode: msdyn_customerasset_statecode,
    statuscode: msdyn_customerasset_statuscode,
}>

export type msdyn_incidenttype = TableRow<{
    // Primary Key Column
    readonly msdyn_incidenttypeid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    msdyn_copyincidentitemstoagreement: msdyn_incidenttype_msdyn_copyincidentitemstoagreement,
    // Foreign Key Column
    readonly _msdyn_defaultworkordertype_value: `/msdyn_workordertype(${string})`,
    readonly msdyn_defaultworkordertypename: string,
    msdyn_description: string,
    msdyn_estimatedduration: number,
    msdyn_lastcalculatedtime: Date,
    msdyn_name: string,
    msdyn_resolutionrequiredonwocompletion: msdyn_incidenttype_msdyn_resolutionrequiredonwocompletion,
    msdyn_suggestedduration: number,
    // Foreign Key Column
    readonly _msdyn_trade_value: `/msdyn_trade(${string})`,
    readonly msdyn_tradename: string,
    readonly owningbusinessunitname: string,
    statecode: msdyn_incidenttype_statecode,
    statuscode: msdyn_incidenttype_statuscode,
}>

export type msdyn_iotalert = TableRow<{
    // Primary Key Column
    readonly msdyn_iotalertid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    msdyn_alertdata: string,
    msdyn_alertpriorityscore: number,
    msdyn_alerttime: Date,
    msdyn_alerttoken: string,
    msdyn_alerttype: msdyn_iotalert_msdyn_alerttype,
    msdyn_alerturl: string,
    // Foreign Key Column
    _msdyn_case_value: `/incident(${string})`,
    readonly msdyn_casename: string,
    // Foreign Key Column
    _msdyn_customerasset_value: `/msdyn_customerasset(${string})`,
    readonly msdyn_customerassetname: string,
    msdyn_description: string,
    // Foreign Key Column
    _msdyn_device_value: `/msdyn_iotdevice(${string})`,
    msdyn_deviceid: string,
    readonly msdyn_devicename: string,
    // Foreign Key Column
    readonly _msdyn_lastcommandsent_value: `/msdyn_iotdevicecommand(${string})`,
    readonly msdyn_lastcommandsentname: string,
    msdyn_lastcommandsenttime: Date,
    // Foreign Key Column
    _msdyn_parentalert_value: `/msdyn_iotalert(${string})`,
    readonly msdyn_parentalertname: string,
    msdyn_parentalerttoken: string,
    // Foreign Key Column
    _msdyn_suggestedincidenttype_value: `/msdyn_incidenttype(${string})`,
    readonly msdyn_suggestedincidenttypename: string,
    msdyn_suggestedpriority: msdyn_iotalert_msdyn_suggestedpriority,
    // Foreign Key Column
    _msdyn_workorder_value: `/msdyn_workorder(${string})`,
    readonly msdyn_workordername: string,
    readonly owningbusinessunitname: string,
    processid: string,
    stageid: string,
    statecode: msdyn_iotalert_statecode,
    statuscode: msdyn_iotalert_statuscode,
    traversedpath: string,
}>

export type msdyn_iotdevice = TableRow<{
    // Primary Key Column
    readonly msdyn_iotdeviceid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _msdyn_account_value: `/account(${string})`,
    readonly msdyn_accountname: string,
    readonly msdyn_accountyominame: string,
    // Foreign Key Column
    readonly _msdyn_category_value: `/msdyn_iotdevicecategory(${string})`,
    readonly msdyn_categoryname: string,
    msdyn_connectionstate: msdyn_iotdevice_msdyn_connectionstate,
    msdyn_deviceid: string,
    msdyn_devicereportedproperties: string,
    msdyn_devicesettings: string,
    // Foreign Key Column
    readonly _msdyn_iotproviderinstance_value: `/msdyn_iotproviderinstance(${string})`,
    readonly msdyn_iotproviderinstancename: string,
    msdyn_issimulated: msdyn_iotdevice_msdyn_issimulated,
    msdyn_lastactivitytime: Date,
    // Foreign Key Column
    readonly _msdyn_lastcommandsent_value: `/msdyn_iotdevicecommand(${string})`,
    readonly msdyn_lastcommandsentname: string,
    msdyn_lastcommandsenttime: Date,
    msdyn_name: string,
    msdyn_registrationmessage: string,
    msdyn_registrationstatus: msdyn_iotdevice_msdyn_registrationstatus,
    msdyn_tags: string,
    msdyn_timezone: number,
    readonly owningbusinessunitname: string,
    statecode: msdyn_iotdevice_statecode,
    statuscode: msdyn_iotdevice_statuscode,
}>

export type msdyn_workorder = TableRow<{
    // Primary Key Column
    readonly msdyn_workorderid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly exchangerate: number,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    msdyn_address1: string,
    msdyn_address2: string,
    msdyn_address3: string,
    msdyn_addressname: string,
    // Foreign Key Column
    readonly _msdyn_agreement_value: `/msdyn_agreement(${string})`,
    readonly msdyn_agreementname: string,
    msdyn_autonumbering: string,
    // Foreign Key Column
    readonly _msdyn_billingaccount_value: `/account(${string})`,
    readonly msdyn_billingaccountname: string,
    readonly msdyn_billingaccountyominame: string,
    msdyn_bookingsummary: string,
    msdyn_childindex: number,
    msdyn_city: string,
    // Foreign Key Column
    readonly _msdyn_closedby_value: `/systemuser(${string})`,
    readonly msdyn_closedbyname: string,
    readonly msdyn_closedbyyominame: string,
    msdyn_completedon: Date,
    msdyn_costntepercent: number,
    msdyn_country: string,
    // Foreign Key Column
    _msdyn_customerasset_value: `/msdyn_customerasset(${string})`,
    readonly msdyn_customerassetname: string,
    msdyn_datewindowend: Date,
    msdyn_datewindowstart: Date,
    readonly msdyn_displayaddress: string,
    msdyn_estimatesubtotalamount: number,
    readonly msdyn_estimatesubtotalamount_base: number,
    msdyn_firstarrivedon: Date,
    msdyn_followupnote: string,
    msdyn_followuprequired: msdyn_workorder_msdyn_followuprequired,
    // Foreign Key Column
    readonly _msdyn_functionallocation_value: `/msdyn_functionallocation(${string})`,
    readonly msdyn_functionallocationname: string,
    msdyn_instructions: string,
    msdyn_internalflags: string,
    // Foreign Key Column
    _msdyn_iotalert_value: `/msdyn_iotalert(${string})`,
    readonly msdyn_iotalertname: string,
    msdyn_isfollowup: msdyn_workorder_msdyn_isfollowup,
    msdyn_ismobile: msdyn_workorder_msdyn_ismobile,
    msdyn_latitude: number,
    msdyn_longitude: number,
    readonly msdyn_mapcontrol: string,
    msdyn_name: string,
    msdyn_nottoexceedcostamount: number,
    readonly msdyn_nottoexceedcostamount_base: number,
    msdyn_nottoexceedpriceamount: number,
    readonly msdyn_nottoexceedpriceamount_base: number,
    // Foreign Key Column
    readonly _msdyn_opportunityid_value: `/opportunity(${string})`,
    readonly msdyn_opportunityidname: string,
    // Foreign Key Column
    _msdyn_parentworkorder_value: `/msdyn_workorder(${string})`,
    readonly msdyn_parentworkordername: string,
    msdyn_phoneNumber: string,
    msdyn_postalcode: string,
    // Foreign Key Column
    _msdyn_preferredresource_value: `/bookableresource(${string})`,
    readonly msdyn_preferredresourcename: string,
    // Foreign Key Column
    readonly _msdyn_pricelist_value: `/pricelevel(${string})`,
    readonly msdyn_pricelistname: string,
    msdyn_pricentepercent: number,
    msdyn_primaryincidentdescription: string,
    msdyn_primaryincidentestimatedduration: number,
    // Foreign Key Column
    _msdyn_primaryincidenttype_value: `/msdyn_incidenttype(${string})`,
    readonly msdyn_primaryincidenttypename: string,
    // Foreign Key Column
    readonly _msdyn_primaryresolution_value: `/msdyn_resolution(${string})`,
    readonly msdyn_primaryresolutionname: string,
    // Foreign Key Column
    readonly _msdyn_priority_value: `/msdyn_priority(${string})`,
    readonly msdyn_priorityname: string,
    msdyn_productsservicescost: number,
    msdyn_productsservicescost_base: number,
    msdyn_productsservicesestimatedcost: number,
    msdyn_productsservicesestimatedcost_base: number,
    // Foreign Key Column
    readonly _msdyn_reportedbycontact_value: `/contact(${string})`,
    readonly msdyn_reportedbycontactname: string,
    readonly msdyn_reportedbycontactyominame: string,
    // Foreign Key Column
    readonly _msdyn_serviceaccount_value: `/account(${string})`,
    readonly msdyn_serviceaccountname: string,
    readonly msdyn_serviceaccountyominame: string,
    // Foreign Key Column
    _msdyn_servicerequest_value: `/incident(${string})`,
    readonly msdyn_servicerequestname: string,
    // Foreign Key Column
    readonly _msdyn_serviceterritory_value: `/territory(${string})`,
    readonly msdyn_serviceterritoryname: string,
    msdyn_stateorprovince: string,
    // Foreign Key Column
    readonly _msdyn_substatus_value: `/msdyn_workordersubstatus(${string})`,
    readonly msdyn_substatusname: string,
    msdyn_subtotalamount: number,
    readonly msdyn_subtotalamount_base: number,
    // Foreign Key Column
    _msdyn_supportcontact_value: `/bookableresource(${string})`,
    readonly msdyn_supportcontactname: string,
    msdyn_systemstatus: msdyn_workorder_msdyn_systemstatus,
    msdyn_taxable: msdyn_workorder_msdyn_taxable,
    // Foreign Key Column
    readonly _msdyn_taxcode_value: `/msdyn_taxcode(${string})`,
    readonly msdyn_taxcodename: string,
    msdyn_timeclosed: Date,
    msdyn_timefrompromised: Date,
    // Foreign Key Column
    readonly _msdyn_timegroup_value: `/msdyn_timegroup(${string})`,
    // Foreign Key Column
    readonly _msdyn_timegroupdetailselected_value: `/msdyn_timegroupdetail(${string})`,
    readonly msdyn_timegroupdetailselectedname: string,
    readonly msdyn_timegroupname: string,
    msdyn_timetopromised: Date,
    msdyn_timewindowend: Date,
    msdyn_timewindowstart: Date,
    msdyn_totalamount: number,
    readonly msdyn_totalamount_base: number,
    msdyn_totalestimatedaftertaxprice: number,
    msdyn_totalestimatedaftertaxprice_base: number,
    msdyn_totalestimatedduration: number,
    msdyn_totalsalestax: number,
    readonly msdyn_totalsalestax_base: number,
    // Foreign Key Column
    readonly _msdyn_trade_value: `/msdyn_trade(${string})`,
    readonly msdyn_tradename: string,
    // Foreign Key Column
    readonly _msdyn_workhourtemplate_value: `/msdyn_workhourtemplate(${string})`,
    readonly msdyn_workhourtemplatename: string,
    msdyn_worklocation: msdyn_workorder_msdyn_worklocation,
    // Foreign Key Column
    readonly _msdyn_workorderarrivaltimekpiid_value: `/slakpiinstance(${string})`,
    readonly msdyn_workorderarrivaltimekpiidname: string,
    // Foreign Key Column
    readonly _msdyn_workorderresolutionkpiid_value: `/slakpiinstance(${string})`,
    readonly msdyn_workorderresolutionkpiidname: string,
    msdyn_workordersummary: string,
    // Foreign Key Column
    readonly _msdyn_workordertype_value: `/msdyn_workordertype(${string})`,
    readonly msdyn_workordertypename: string,
    readonly owningbusinessunitname: string,
    processid: string,
    rcwr_acv: number,
    readonly rcwr_acv_base: number,
    rcwr_acvlasemonth: number,
    readonly rcwr_acvlasemonth_base: number,
    rcwr_css: msdyn_workorder_rcwr_css,
    // Foreign Key Column
    readonly _rcwr_dailyreport_value: `/rcwr_dailyreport(${string})`,
    readonly rcwr_dailyreportname: string,
    rcwr_hosyukaisi: string,
    rcwr_hosyutantokaisya: string,
    rcwr_iso: msdyn_workorder_rcwr_iso,
    rcwr_karitouroku: string,
    rcwr_kijundata: Date,
    rcwr_kubun: string,
    rcwr_kubunmei: string,
    readonly rcwr_lastvisit: Date,
    readonly rcwr_lastvisit_date: Date,
    readonly rcwr_lastvisit_state: number,
    rcwr_pmno: string,
    rcwr_rtcuketsuke: string,
    rcwr_sotencode: string,
    rcwr_tantocekanji: string,
    rcwr_tantokasyocode: string,
    rcwr_tantokasyoname: string,
    rcwr_tantouce: string,
    rcwr_tantouname: string,
    rcwr_thtencode: string,
    rcwr_tstencode: string,
    stageid: string,
    statecode: msdyn_workorder_statecode,
    statuscode: msdyn_workorder_statuscode,
    // Foreign Key Column
    readonly _transactioncurrencyid_value: `/transactioncurrency(${string})`,
    readonly transactioncurrencyidname: string,
    traversedpath: string,
}>

export type msdyn_workorderservicetask = TableRow<{
    // Primary Key Column
    readonly msdyn_workorderservicetaskid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    msdyn_actualduration: number,
    // Foreign Key Column
    readonly _msdyn_agreementbookingservicetask_value: `/msdyn_agreementbookingservicetask(${string})`,
    readonly msdyn_agreementbookingservicetaskname: string,
    // Foreign Key Column
    _msdyn_booking_value: `/bookableresourcebooking(${string})`,
    readonly msdyn_bookingname: string,
    // Foreign Key Column
    _msdyn_customerasset_value: `/msdyn_customerasset(${string})`,
    readonly msdyn_customerassetname: string,
    msdyn_description: string,
    msdyn_estimatedduration: number,
    // Foreign Key Column
    readonly _msdyn_inspection_value: `/msdyn_inspection(${string})`,
    // Foreign Key Column
    readonly _msdyn_inspectiondefinitionid_value: `/msdyn_inspectiondefinition(${string})`,
    readonly msdyn_inspectiondefinitionidname: string,
    msdyn_inspectionenabled: msdyn_workorderservicetask_msdyn_inspectionenabled,
    readonly msdyn_inspectionname: string,
    // Foreign Key Column
    readonly _msdyn_inspectionresponseid_value: `/msdyn_inspectionresponse(${string})`,
    readonly msdyn_inspectionresponseidname: string,
    msdyn_inspectionresult: msdyn_workorderservicetask_msdyn_inspectionresult,
    msdyn_inspectiontaskresult: msdyn_workorderservicetask_msdyn_inspectiontaskresult,
    msdyn_internalflags: string,
    msdyn_lineorder: number,
    msdyn_name: string,
    msdyn_percentcomplete: number,
    msdyn_surveyboundedoutput: string,
    // Foreign Key Column
    readonly _msdyn_tasktype_value: `/msdyn_servicetasktype(${string})`,
    readonly msdyn_tasktypename: string,
    // Foreign Key Column
    _msdyn_workorder_value: `/msdyn_workorder(${string})`,
    // Foreign Key Column
    readonly _msdyn_workorderincident_value: `/msdyn_workorderincident(${string})`,
    readonly msdyn_workorderincidentname: string,
    readonly msdyn_workordername: string,
    readonly owningbusinessunitname: string,
    statecode: msdyn_workorderservicetask_statecode,
    statuscode: msdyn_workorderservicetask_statuscode,
}>

const enum bookableresource_msdyn_crewstrategy {
"スタッフ リーダー管理" = 192350001,
"スタッフ メンバー自己管理" = 192350002,
"伝播して、伝播を完全に受け入れる (非推奨)" = 192350000,
}
const enum bookableresource_msdyn_derivecapacity {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresource_msdyn_displayonscheduleassistant {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresource_msdyn_displayonscheduleboard {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresource_msdyn_enableappointments {
"無効" = 192350000,
"有効" = 192350001,
}
const enum bookableresource_msdyn_enabledforfieldservicemobile {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresource_msdyn_enabledripscheduling {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresource_msdyn_enableoutlookschedules {
"無効" = 192350000,
"有効" = 192350001,
}
const enum bookableresource_msdyn_endlocation {
"場所指定なし" = 690970002,
"リソース住所" = 690970000,
"組織単位の住所" = 690970001,
}
const enum bookableresource_msdyn_generictype {
"サービス センター" = 690970000,
}
const enum bookableresource_msdyn_pooltype {
"取引先企業" = 192350000,
"取引先担当者" = 192350001,
"ユーザー" = 192350002,
"備品" = 192350003,
"設備" = 192350004,
}
const enum bookableresource_msdyn_startlocation {
"場所指定なし" = 690970002,
"リソース住所" = 690970000,
"組織単位の住所" = 690970001,
}
const enum bookableresource_msdyn_timeoffapprovalrequired {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresource_resourcetype {
"汎用" = 1,
"取引先担当者" = 2,
"ユーザー" = 3,
"備品" = 4,
"取引先企業" = 5,
"スタッフ" = 6,
"設備" = 7,
"プール" = 8,
}
const enum bookableresource_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum bookableresource_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}
const enum bookableresourcebooking_bookingtype {
"流動" = 2,
"固定" = 1,
}
const enum bookableresourcebooking_msdyn_acceptcascadecrewchanges {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresourcebooking_msdyn_allowoverlapping {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresourcebooking_msdyn_bookingmethod {
"最適化" = 192350000,
"システム - 契約のスケジュール" = 690970005,
"スケジュール ボード" = 690970001,
"モバイル" = 690970002,
"手動" = 690970003,
"スケジュール アシスタント" = 690970004,
}
const enum bookableresourcebooking_msdyn_cascadecrewchanges {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresourcebooking_msdyn_crewmembertype {
"リーダー" = 192350000,
"メンバー" = 192350001,
"なし" = 192350002,
}
const enum bookableresourcebooking_msdyn_preventtimestampcreation {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresourcebooking_msdyn_quickNoteAction {
"なし" = 100000000,
"テキスト" = 100000001,
"写真" = 100000002,
"ビデオ" = 100000003,
"音声" = 100000004,
"ファイル" = 100000005,
}
const enum bookableresourcebooking_msdyn_traveltimecalculationtype {
"履歴トラフィックのない Bing 地図" = 192350000,
"履歴トラフィックのある Bing 地図" = 192350001,
"カスタム マップ プロバイダー" = 192350002,
"概算" = 192350003,
}
const enum bookableresourcebooking_msdyn_traveltimerescheduling {
"いいえ" = 0,
"はい" = 1,
}
const enum bookableresourcebooking_msdyn_worklocation {
"オンサイト" = 690970000,
"設備" = 690970001,
"場所指定なし" = 690970002,
}
const enum bookableresourcebooking_rcwr_activitytype {
"サービス" = 100000000,
"移動" = 100000001,
"営業" = 100000002,
"ナレッジトランスファー" = 100000003,
"報告書作成" = 100000004,
"社内打ち合わせ" = 100000005,
}
const enum bookableresourcebooking_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum bookableresourcebooking_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}
const enum incident_activitiescomplete {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_blockedprofile {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_caseorigincode {
"電話" = 1,
"電子メール" = 2,
"Web" = 3,
"Facebook" = 2483,
"Twitter" = 3986,
"IoT" = 700610000,
}
const enum incident_casetypecode {
"質問" = 1,
"問題" = 2,
"要求" = 3,
}
const enum incident_checkemail {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_contractservicelevelcode {
"ゴールド" = 1,
"シルバー" = 2,
"ブロンズ" = 3,
}
const enum incident_customercontacted {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_customersatisfactioncode {
"非常に満足" = 5,
"満足" = 4,
"どちらともいえない" = 3,
"不満" = 2,
"非常に不満" = 1,
}
const enum incident_decremententitlementterm {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_firstresponsesent {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_firstresponseslastatus {
"進行中" = 1,
"ほぼ非準拠" = 2,
"成功" = 3,
"非準拠" = 4,
}
const enum incident_followuptaskcreated {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_incidentstagecode {
"既定値" = 1,
}
const enum incident_isdecrementing {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_isescalated {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_merged {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_messagetypecode {
"パブリック メッセージ" = 0,
"プライベート メッセージ" = 1,
}
const enum incident_msdyn_casesentiment {
"該当なし" = 0,
"とても否定的" = 7,
"否定的" = 8,
"やや否定的" = 9,
"中立的" = 10,
"やや肯定的" = 11,
"肯定的" = 12,
"とても肯定的" = 13,
}
const enum incident_msdyn_copilotengaged {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_prioritycode {
"高" = 1,
"中" = 2,
"低" = 3,
}
const enum incident_resolvebyslastatus {
"進行中" = 1,
"ほぼ非準拠" = 2,
"成功" = 3,
"非準拠" = 4,
}
const enum incident_routecase {
"いいえ" = 0,
"はい" = 1,
}
const enum incident_servicestage {
"特定" = 0,
"調査" = 1,
"解決" = 2,
}
const enum incident_severitycode {
"既定値" = 1,
}
const enum incident_statecode {
"アクティブ" = 0,
"解決済み" = 1,
"キャンセル済み" = 2,
}
const enum incident_statuscode {
"問題解決済み" = 5,
"情報提供済み" = 1000,
"キャンセル済み" = 6,
"統合" = 2000,
"進行中" = 1,
"保留中" = 2,
"詳細待ち" = 3,
"調査中" = 4,
}
const enum msdyn_customerasset_msdyn_alert {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_customerasset_msdyn_registrationstatus {
"不明" = 192350000,
"未登録" = 192350001,
"進行中" = 192350002,
"登録済み" = 192350003,
"エラー" = 192350004,
}
const enum msdyn_customerasset_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum msdyn_customerasset_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}
const enum msdyn_incidenttype_msdyn_copyincidentitemstoagreement {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_incidenttype_msdyn_resolutionrequiredonwocompletion {
"無効" = 0,
"有効" = 1,
}
const enum msdyn_incidenttype_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum msdyn_incidenttype_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}
const enum msdyn_iotalert_msdyn_alerttype {
"異常" = 192350000,
"情報" = 192350001,
"予防保全" = 192350002,
"テスト" = 192350003,
}
const enum msdyn_iotalert_msdyn_suggestedpriority {
"計算しています" = 192350000,
"高" = 192350001,
"低" = 192350002,
"サジェスチョンはありません。" = 192350003,
}
const enum msdyn_iotalert_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
"処理中" = 2,
"クローズ済み" = 3,
}
const enum msdyn_iotalert_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
"進行中 - サポート案件作成済み" = 3,
"進行中 - 作業指示書作成済み" = 4,
"進行中 - コマンド送信済み" = 5,
"クローズ済み" = 6,
"進行中 - コマンドが失敗しました" = 7,
}
const enum msdyn_iotdevice_msdyn_connectionstate {
"切断" = 0,
"接続済み" = 1,
}
const enum msdyn_iotdevice_msdyn_issimulated {
"はい" = 192350000,
"いいえ" = 192350001,
}
const enum msdyn_iotdevice_msdyn_registrationstatus {
"不明" = 192350000,
"未登録" = 192350001,
"進行中" = 192350002,
"登録済み" = 192350003,
"エラー" = 192350004,
}
const enum msdyn_iotdevice_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum msdyn_iotdevice_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}
const enum msdyn_workorder_msdyn_followuprequired {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_workorder_msdyn_isfollowup {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_workorder_msdyn_ismobile {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_workorder_msdyn_systemstatus {
"スケジュールなし" = 690970000,
"スケジュール" = 690970001,
"処理中" = 690970002,
"完了" = 690970003,
"転記済み" = 690970004,
"取り消し済み" = 690970005,
}
const enum msdyn_workorder_msdyn_taxable {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_workorder_msdyn_worklocation {
"オンサイト" = 690970000,
"設備" = 690970001,
"場所指定なし" = 690970002,
}
const enum msdyn_workorder_rcwr_css {
"0" = 0,
"1" = 1,
}
const enum msdyn_workorder_rcwr_iso {
"0" = 0,
"1" = 1,
}
const enum msdyn_workorder_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum msdyn_workorder_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}
const enum msdyn_workorderservicetask_msdyn_inspectionenabled {
"いいえ" = 0,
"はい" = 1,
}
const enum msdyn_workorderservicetask_msdyn_inspectionresult {
"成功" = 100000000,
"失敗" = 100000001,
"無効" = 100000002,
}
const enum msdyn_workorderservicetask_msdyn_inspectiontaskresult {
"成功" = 192350000,
"失敗" = 192350001,
"部分的な成功" = 192350002,
"なし" = 192350003,
}
const enum msdyn_workorderservicetask_statecode {
"アクティブ" = 0,
"非アクティブ" = 1,
}
const enum msdyn_workorderservicetask_statuscode {
"アクティブ" = 1,
"非アクティブ" = 2,
}

export interface UxAgentDataApi extends BaseUxAgentDataApi<TableRegistrations, EnumRegistrations> {}

export interface GeneratedComponentProps {
    dataApi: UxAgentDataApi;
}

