
/*
 *Author: Jacob Goodall
 *Date: 04/08/2022
 *Description: Call Ritual API to retrieve orders to Create SO record in NS
 */
//Login via OAuth2 to SF
//Call their api
//Retreieve their orders
//loop through ther orders
//Create and fill out SO in NS
//Submit record


function createRecord() {

    //Send OAUTH 2.0 call to get Access Token
    var authURL = 'https://ritual--milos.my.salesforce.com/services/oauth2/authorize';
    var callBackURL = 'https://test.salesforce.com/services/oauth2/success';
    var accessTokenURL = 'https://ritual--milos.my.salesforce.com/services/oauth2/token';
    var clientID = '3MVG9S6qnsIUe5wAWZloPQ.HISmfEavNJl82jRE0khvKi6m.IhjP5tLECv0dTaWjaxGabyJc6KusFCWrE1ulV';
    var clientSecret = '6872A5E5383F4D0D0876B82325281F224E9FE634E937BD77F0FF3962D8DCDE65';

    // we then do they call to get access token. We input our info
    // user: kevind@overturepromo.com.milos
    // pass: X13Bilxzs

    //We should get a our first response which should have some inforation
    var tokenName = '';
    var accessToken = '';
    var tokenType = '';
    var signature = '';
    var scope = '';
    var instanceURL = '';
    var issuedAt = '';

    //Then we want to add our access token which we just got to our header
    //This will have to look different I'm guessing since this is OAuth vs a standard API call. 
    var header = {
        'Cache-Control' : 'no-cache',
        'Content-Type' : 'application/json',
        'Authorization': accessToken
      };

    //Then we do a GET request to
    var response = nlapiRequestURL(
        'https://ritual--milos.my.salesforce.com/services/data/v54.0/query/?q=SELECT FIELDS(ALL) FROM Equipment_Order__c LIMIT 200',
        null,
        header,
        null,
        'GET'
      );

      //WE should now have all order in JSON format. Getting to this point will most "likely" be the hard part. 

}