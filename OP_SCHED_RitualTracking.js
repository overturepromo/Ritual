/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */


define(['N/https', 'N/record', 'N/search'],

function (https, record, search) {
    function execute(context) {

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

        //So we have authorization out of the way. 
        //We will need to load a saved search that has these orders with tracking info.
        //Loop through these orders and update Shipment_Tracking_Number__c to {tracking}
        //To target the right order number in SF, we need it's internal ID. 
        //So I think I need to update my orders script to place that id in some field.

        var search = s.load({
            type: record.Type.SALES_ORDER,
            id: 'customsearch435_2_5_4', //Whatever the custom serach is
        });
      
        var resultSet = search.run();
        var results = resultSet.getRange({
            start: 0,
            end: 1000
        });

        for (var i = 0; i < results.length; i++) {

            try {

                var objRecord = record.load({
                    type: record.Type.SALES_ORDER,
                    id: results[i].id,
                    isDynamic: true,
                });

                var ritualId = ''//will need to be the dynamic id probably based off a field.
                var trackingNumber = objRecord.getValue({
                    fieldId: 'linkedtrackingnumbers'
                });
                var patchURL =  "https://ritual--milos.my.salesforce.com/services/data/v54.0/sobjects/Equipment_Order__c/" + ritualId+"?_HttpMethod=PATCH";
        
                var trackingBody = {
                    "Shipment_Tracking_Number__c" : trackingNumber
                }
        
                var trackingHeaders = {
                    "X-HTTP-Method-Override": "PATCH",
                    "Authorization": "OAuth " + accessToken, 
                    "Content-Type": "application/json"
                }
        
                var trackingResponse = https.post({
                    url: patchURL,
                    body: JSON.stringify(trackingBody),
                    headers: trackingHeaders
                })
        
                var ritualResponse = trackingResponse.code;
                var ritualBody = JSON.parse(trackingResponse.body);

                //if all is well then I'm guessing we need to tick a box to let the saved search know this tracking number has been applied

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
        var end = 'the end';
    }

    //execute();
    return {
        execute: execute
    };

});