/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */


define(['N/https', 'N/record', 'N/search'],

function (https, record, search) {
    function execute(context) {

        function getIdBySKU(sku) {

            var internalid = null;
            //Notes for self to understand. First we are creating a saved search on the fly where the item is our sku
            var mySearch = search.create({
                type: 'item',
                filters: [
                    ["name", "is", sku]
                ],
                //How did you know to create this column. Read more about createColum in documenation
                //A search column represents a field on a record. You create a column for each field that you want to include in the 
                //search results. For example, if you create a column for the Sales Rep field on a customer record and specify that 
                //column when you create a search, the value of the Sales Rep field is included in the search results.
                columns: [
                    search.createColumn({
                        name: "internalid", //required Should try this in the UI. hard to visualize this vs the filter
                        label: "Internal ID"
                    })
                ]
            });

            //We are now running the search we created and only going through the first one. Storing as an array variable. 
            var searchResult = mySearch.run().getRange({
                start: 0,
                end: 1
            });

            //If we always just have one, do we need to loop? Probably good practice. 
            for (var i = 0; i < searchResult.length; i++) {
                internalid = searchResult[i].getValue({
                    name: 'internalid'
                });
            }
            //as it says, returns the internal id of the sku
            return internalid;
        }

        var clientID = "3MVG9S6qnsIUe5wAWZloPQ.HISmfEavNJl82jRE0khvKi6m.IhjP5tLECv0dTaWjaxGabyJc6KusFCWrE1ulV";
        var clientSecret = "6872A5E5383F4D0D0876B82325281F224E9FE634E937BD77F0FF3962D8DCDE65";
        var refreshToken = '5Aep861YULFLbnJadjWoz6lpAKTlEj7Txzkk6S.vyErlVzyZ5be0XdHgWvZ2WhgZswRzBLQNTrwgnDvhQgf7Ct7';

        var resfreshBody = {
            "grant_type": 'refresh_token',
            "client_id": clientID,
            "client_secret": clientSecret,
            "refresh_token": refreshToken
        }

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

        if (ordersCode != 200) {
            log.debug('Could not query SalesForce. Response code was not 200, it is ' + ordersCode);
            email.send({
                author: 5009366,
                recipients: 'jacobg@overturepromo.com',
                subject: 'Ritual SalesForce bad GET',
                body: 'Error  in retreving query from Rituals SalesForce: ' + runtime.getCurrentScript().id + '\n\n' + JSON.stringify(err)
            });
            return;
        }

        var results = ordersBody.records
        for (var i = 0; i < results.length; i++) {

            try {
                var currentOrder = results[i];

                /////////////////////
                // GENERAL DETAILS //
                /////////////////////
                var newSORecord = record.create({
                    type: record.Type.SALES_ORDER,
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
                    fieldId: 'custbody_customer_email',
                    value: currentOrder.Store_Contact_Email_Address__c
                })


                //////////////////////
                // SHIPPING ADDRESS //
                //////////////////////
                //always country first!!

                var shipCountry = currentOrder.Shipping_Country_Text__c.toLowerCase();

                if (shipCountry == 'canada' || shipCountry == 'can') {
                    shipCountry = 'CA'
                } else if (shipCountry == 'usa' || shipCountry == 'united states') {
                    shipCountry = 'US'
                } else {
                    shipCountry.toUpperCase();
                }

                newSORecord.setValue({
                    fieldId: 'shipaddresslist',
                    value: null
                })

                var shipaddrSubrecord = newSORecord.getSubrecord({
                    fieldId: 'shippingaddress'
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'country',
                    value: shipCountry
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'attention',
                    value: currentOrder.Store_Contact_First_Name__c + ' ' + currentOrder.Store_Contact_Last_Name__c
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'addr1',
                    value: currentOrder.Shipping_Street__c
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'addr2',
                    value: currentOrder.Shipping_Address_Line_2__c
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'city',
                    value: currentOrder.Shipping_City__c
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'state',
                    value: currentOrder.Shipping_State__c
                });
                shipaddrSubrecord.setValue({
                    fieldId: 'zip',
                    value: currentOrder.Shipping_Postal_Code__c
                });

                //KEVIN: don't you have to submit the subrecord somehow? This is working as-is?

                newSORecord.setValue({
                    fieldId: 'custbody_shiptophone',
                    value: currentOrder.Store_Phone_Number__c
                })
                newSORecord.setValue({
                    fieldId: 'shipphone',
                    value: currentOrder.Store_Phone_Number__c
                })


                ////////////////
                // LINE ITEMS //
                ////////////////

                //Canada
                var RIT007_CA = 560546; //Merchant Device
                var RIT_CADKIT = 550984; //Install Kit Marketing Only
                //USA
                var RIT007_US = 560545; //Merchant Device
                var RIT_USDKIT = 550985; //Install Kit Marketing Only

                var ritualEquipment = currentOrder.Equipment__c;
                var itemSku;
                var bothItemsCA = false;
                var bothItemsUS = false

                if (shipCountry == 'CA') {
                    if (ritualEquipment == 'Merchant Device') {
                        itemSku = 'RIT007-CA';
                    } else if (ritualEquipment == 'Install Kit Marketing Only') {
                        itemSku = 'RIT-CADKIT';
                    } else if (ritualEquipment == 'Install Kit No DPS') {
                        bothItemsCA = true;
                    }
                } else if (shipCountry == 'US') {
                    if (ritualEquipment == 'Merchant Device') {
                        itemSku = 'RIT007-US';
                    } else if (ritualEquipment == 'Install Kit Marketing Only') {
                        itemSku = 'RIT-USDKIT';
                    } else if (ritualEquipment == 'Install Kit No DPS') {
                        bothItemsUS = true;
                    }
                }

                var uniqueInternalIds = [];


                // Grab the internal ID from the sku
                if (bothItemsCA == false && bothItemsUS == false) {
                    var itemID = getIdBySKU(itemSku);
                    uniqueInternalIds.push(itemID)
                } else if (bothItemsCA) {
                    uniqueInternalIds.push(RIT007_CA, RIT_CADKIT);
                } else {
                    uniqueInternalIds.push(RIT007_US, RIT_USDKIT);
                }

                //KEVIN: For the items, agreed that we don't actually need the getIdBySKU function for this script. You'll need that function in the future, though.
                //KEVIN: Consider declaring an array of internal ids that contains the items you need to add to this order (above, where you're determing which lines go on the order, push internal ids into the blank array as you work through the if/else stuff). Then below you simply have a for loop that uses that array to add line(s) from the array. This way your logic is separate from the line-processing code - and you can re-use your line-processing code for other scripts.

                for (var i = 0; i < uniqueInternalIds.length; i++) {
                    
                    newSORecord.selectNewLine({
                        sublistId: 'item',
                    });
                    newSORecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: uniqueInternalIds[i]
                    });

                    newSORecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: 1
                    });
                    newSORecord.commitLine({
                        sublistId: 'item'
                    });
                }


                //Patching Rituals salesforce order
                //https://ritual--milos.my.salesforce.com/services/data/v54.0/composite/sobjects/Equipment_Order__c/{id}
                //https://ritual--milos.my.salesforce.com/services/data/v54.0/sobjects/Equipment_Order__c/{id}

                //Authorization: Bearer token

                var ritualId = currentOrder.Id;

                var updateRitualHeaders = {
                    "X-HTTP-Method-Override": "PATCH",
                    "Authorization": "OAuth " + accessToken, //OAuth could possibly be Bearer + token
                    "Content-Type": "application/json"
                }

                var postURL =  "https://ritual--milos.my.salesforce.com/services/data/v54.0/sobjects/Equipment_Order__c/" + ritualId+"?_HttpMethod=PATCH";

                var updateRitualBody = {
                    "Stage__c" : "Shipped"
                }

                var updateRitualId = https.post({
                    url: postURL,
                    body: JSON.stringify(updateRitualBody),
                    headers: updateRitualHeaders
                })

                var ritualIdResponse = updateRitualId.code;
                var ritualIdBody = JSON.parse(updateRitualId.body);


                //Then we need to submit the record
                var newID = newSORecord.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });
                log.debug("SO Record " + newID + " successfully created");


            } catch (err) {
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
        }
        //KEVIN: LOL at the debugger var
        var end = 'the end';
    }

    //execute();
    return {
        execute: execute
    };

});