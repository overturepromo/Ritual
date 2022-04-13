/**
 *@NApiVersion 2.x
 */


//Login via OAuth2 to SF
//Call their api
//Retreieve their orders
//loop through ther orders
//Create and fill out SO in NS
//Submit record

define(['N/https', 'N/record'],

function (https, record)
{
    function execute(context)
    {
        //First is login to SF via OAuth
        loginSalesforceNLAP();
    }

    return {execute: execute};

});



//Functions that can be used outisde of the main function scope.
//Connect to Salesforce instance and obtain the Access Token used for subsequent Salesforce calls this session
function loginSalesforceNLAP() {

    //production
    var clientID = "3MVG9S6qnsIUe5wAWZloPQ.HISmfEavNJl82jRE0khvKi6m.IhjP5tLECv0dTaWjaxGabyJc6KusFCWrE1ulV";
    var clientSecret = "6872A5E5383F4D0D0876B82325281F224E9FE634E937BD77F0FF3962D8DCDE65";
    var authURL = 'https://ritual--milos.my.salesforce.com/services/oauth2/authorize';
    var callBackURL = 'https://test.salesforce.com/services/oauth2/success';
    var accessTokenURL = 'https://ritual--milos.my.salesforce.com/services/oauth2/token';
    var username = "kevind@overturepromo.com.milos";
    var password = "X13Bilxzs";

    //We don't have a loginURL or security token. Must udpate to match POSTman or what's in SF documentation
    var loginURL = "https://login.salesforce.com/services/oauth2/token";
    var securityToken = "N0bx9d323231aO321igJ6";

    var header = [];
    header['Content-Type'] = 'application/json;charset=UTF-8';
    var recordData = {};
    //This will ovbiously have to updated to match the format that was given. Keeping for now until I find the right loginURL string
    var url = loginURL + "?grant_type=password&client_id=" + clientID + "&client_secret=" + clientSecret + "&username=" + username + "&password=" + password + securityToken;

    try
    {
        response = _HTTPS.post({
                url: url,
                body: recordData,
                headers: header
            });
        response = JSON.parse(JSON.stringify(response));
        if (response.code == 200 || response.code == 204)
            return JSON.parse(response.body);
    }
    catch (er02)
    {
        log.error('ERROR:loginSalesforceNLAP', er02);
    }
    return "";
}

//get URL of max version of SF
// function getURL(body)
// {     

// }