/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */


define(['N/https', 'N/record', 'N/search'],

function (https, record, s)
{
    function execute(context)
    {

        var clientID = "3MVG9S6qnsIUe5wAWZloPQ.HISmfEavNJl82jRE0khvKi6m.IhjP5tLECv0dTaWjaxGabyJc6KusFCWrE1ulV";
        var clientSecret = "6872A5E5383F4D0D0876B82325281F224E9FE634E937BD77F0FF3962D8DCDE65";
        var refreshToken = '5Aep861YULFLbnJadjWoz6lpAKTlEj7Txzkk6S.vyErlVzyZ5bqK8LYhNOlvGj_BuzeNbw7zzUp6sQmF9r89Msz';

        var resfreshBody = {
            "grant_type" : 'refresh_token',
            "client_id" : clientID,
            "client_secret": clientSecret,
            "refresh_token" : refreshToken
        }

        try{

            var refreshResponse = https.post({
                url: 'https://ritual--milos.my.salesforce.com/services/oauth2/token',
                body: resfreshBody,
            })

            var refreshCode = refreshResponse.code;
            var refreshBody = JSON.parse(refreshResponse.body);
            var accessToken = refreshBody.access_token;

            var headersObj = {
                "Authorization": "OAuth " + accessToken,
                "Content-Type": "application/json"
            }

            var oldURL = 'https://ritual--milos.my.salesforce.com/services/data/v54.0/query/?q=SELECT FIELDS(ALL) FROM Equipment_Order__c LIMIT 200'
            var newURL = "https://ritual--milos.my.salesforce.com/services/data/v54.0/query/?q=SELECT Id, Name, Equipment__c, Store_Contact_First_Name__c, Store_Contact_Last_Name__c, Store_Phone_Number__c, Store_Contact_Email_Address__c, Equipment_Order__c.Account__r.store_name__c, Shipping_Street__c, Shipping_Address_Line_2__c, Shipping_City__c,Shipping_Postal_Code__c,Shipping_State__c, Shipping_Country_Text__c, Notes__c FROM Equipment_Order__c  WHERE Stage__c = 'New'AND RecordTypeId = '0120g000000ECbNAAW' AND Equipment__c IN ('merchant device', 'install kit no dps', 'install kit marketing only') AND Shipping_Country_Text__c IN ('usa', 'united states', 'us', 'can', 'ca', 'canada')";

            var ordersResponse = https.get({
                url: newURL,
                headers: headersObj
            })

            var ordersCode = ordersResponse.code;
            var ordersBody = JSON.parse(ordersResponse.body);

            if(ordersCode != 200)
            {
                log.debug('Could not query SalesForce ' + ordersCode);
                return;
            }

            var results = ordersBody.records
            for(var i = 0; i < results.length; i++){

                var currentOrder = results[i];

                /////////////////////
                // GENERAL DETAILS //
                /////////////////////
                var newSORecord = record.create({
                    type: record.Type.SALES_ORDER ,
                    isDynamic: true
                })

                newSORecord.setValue({
                    fieldId: 'customform',
                    value: 119
                  })
                newSORecord.setValue({
                    fieldId: 'entity',
                    value: 8749204
                })
                newSORecord.setValue({
                    fieldId: 'class',
                    value: 2
                })
                newSORecord.setValue({
                    fieldId: 'custbody_special_instructions',
                    value: currentOrder.Notes__c
                })
                newSORecord.setValue({
                    fieldId: 'email',
                    value: currentOrder.Store_Contact_Email_Address__c
                })
                newSORecord.setValue({
                    fieldId: 'custbody47',
                    value: ''
                })


                //////////////////////
                // SHIPPING ADDRESS //
                //////////////////////
                //always country first!!

                var shippCountry = currentOrder.Shipping_Country_Text__c.toLowerCase();

                if(shippCountry == 'canada' || shippCountry == 'can'){
                    shippCountry = 'CA'
                } else if(shippCountry == 'usa' || shippCountry == 'united states'){
                    shippCountry = 'US'
                }else{
                    shippCountry.toUpperCase();
                }

                newSORecord.setValue({
                    fieldId: 'shipaddresslist',
                    value: null
                })
                newSORecord.setValue({
                    fieldId: 'shipcountry',
                    value: shippCountry
                })
                newSORecord.setValue({
                    fieldId: 'shipzip',
                    value: currentOrder.Shipping_Postal_Code__c
                })
                newSORecord.setValue({
                    fieldId: 'shipstate',
                    value: currentOrder.Shipping_State__c
                })
                newSORecord.setValue({
                    fieldId: 'shipcity',
                    value: currentOrder.Shipping_City__c
                })
                newSORecord.setValue({
                    fieldId: 'shipattention',
                    value: currentOrder.Store_Contact_First_Name__c + ' ' + currentOrder.Store_Contact_Last_Name__c
                })
                newSORecord.setValue({
                    fieldId: 'shipaddr1',
                    value: currentOrder.Shipping_Street__c
                })
                newSORecord.setValue({
                    fieldId: 'shipaddr2',
                    value: null
                })
                newSORecord.setValue({
                    fieldId: 'custbody_shiptophone',
                    value: currentOrder.Phone__c
                })
                newSORecord.setValue({
                    fieldId: 'shipphone',
                    value: currentOrder.Phone__c
                })
                newSORecord.setValue({
                    fieldId: 'shipdate',
                    value: currentOrder.Shipped_Date__c
                })
                newSORecord.setValue({
                    fieldId: 'shipmethod',
                    value: null
                })

                /////////////////////
                // BILLING ADDRESS //
                /////////////////////
                //always country first!!

                //////////////////
                // CONTACT INFO //
                //////////////////

                ////////////////
                // LINE ITEMS //
                ////////////////

                //Canada
                var RIT007_CA = 560546; //Merchant Device
                var RIT_CADKIT = 550984; //Install Kit Marketing Only
                //USA
                var RIT007_US = 560545; //Merchant Device
                var RIT_USDKIT = 550985; //Install Kit Marketing Only

                //However, the Install Kit No DPS is just both of their country's sku. So if that is the item, will it be two items?

                var ritualEquipment = currentOrder.Equipment__c;
                var itemID;
                var bothItemsCA = false;
                var bothItemsUS = false

                if(shippCountry == 'CA'){
                    if(ritualEquipment == 'Merchant Device'){
                        itemID = RIT007_CA;
                    }else if (ritualEquipment == 'Install Kit Marketing Only'){
                        itemID = RIT_CADKIT;
                    }else if (ritualEquipment == 'Install Kit No DPS'){
                        bothItemsCA = true;
                    }
                }else if(shippCountry == 'US'){
                    if(ritualEquipment == 'Merchant Device'){
                        itemID = RIT007_US;
                    }else if (ritualEquipment == 'Install Kit Marketing Only'){
                        itemID = RIT_USDKIT;
                    }else if (ritualEquipment == 'Install Kit No DPS'){
                        bothItemsUS = true;
                    }
                }
                
                var itemSearchObj = s.create({
                    type: "item",
                    filters:
                    [
                       ["name","is","RIT007-CA"]
                    ],
                 });
                 var searchResultCount = itemSearchObj.runPaged().count;
                 log.debug("itemSearchObj result count",searchResultCount);


                newSORecord.selectNewLine({ 
                    sublistId: 'item',
                }); 
 
                newSORecord.setCurrentSublistValue({ 
                    sublistId: 'item', 
                    fieldId: 'item', 
                    value: 223223 
                }); 
                 
                newSORecord.setCurrentSublistValue({ 
                    sublistId: 'item', 
                    fieldId: 'quantity', 
                    value: 1 
                });
                
                newSORecord.commitLine({ 
                    sublistId: 'item' 
                });



                //Then we need to submit the record
                var newID = newSORecord.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                  });
                log.debug("SO Record " + newID +  " successfully created");
            }
            
        }
        catch (err)
        {
            log.error('ERROR:loginSalesforceNLAP', err);
            log.error({
                title: err.code,
                details: err.message
            });
            var subject = 'ERROR retrieving order from Ritual';
            var authorId = 5009366;
            var recipientEmail = 'jacobg@overturepromo.com';
            email.send({
              author: authorId,
              recipients: recipientEmail,
              subject: subject,
              body: 'Fatal error occurred in script: ' + runtime.getCurrentScript().id + '\n\n' + JSON.stringify(err)
            });
        }
        var end = 'the end';

    }

    //execute();
    return {execute: execute};

});

