/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */

define(['N/https', 'N/record'],

function (https, record)
{
    //handle the bs if its being created
    function afterSubmit(context)
    {
        var body;
        var response;
        var recordData = {};
        var queryURL;

        body = loginSalesforceNLAP(); //login to SF

        //error check the login
        if(body.access_token == undefined || body.access_token == "")
        {
            log.debug("afterSubmit","Could not access SF");
            return;
        }

        //check this email exists in SF
        response = _HTTPS.get({
            url: getURL(body) + "/query/?q=SELECT Id FROM User WHERE Username = user",
            body: recordData,
            headers: {"Authorization": "OAuth " + body.access_token,"Content-Type": "application/json"}
        });

        if(response.code != 200)
        {
            log.debug('afterSubmit', 'Could not query SF ' + response.code + ' ');
            return;
        }

        //Check results (only 1 should be returned)
        var b = JSON.parse(response.body);
        if (b.totalSize == 1)
        {
            SFID = b.records[0].Id;
            log.debug('afterSubmit', 'Found user in SF with ID ' + SFID);
        }
        else
        {
            log.debug('afterSubmit', 'No SF user with username user was found in SF');   
            return;
        }    
    }

    return {afterSubmit: afterSubmit};

});

//get URL of max version of SF
function getURL(body)
{           
    var max;
    var arr;
    var header = {"Authorization": "OAuth " + body.access_token  };
    var recordData = {};
    var url = body.instance_url + "/services/data/";

    response = _HTTPS.get({
                url: url,
                body: recordData,
                headers: header
            });

    if(response.code == 200 || response.code == 204)
    {
        arr = JSON.parse(response.body);
        for(var i = 0; i < arr.length; i++)
        {
            if(!max || parseInt(arr[i]["version"]) > parseInt(max["version"]))
                max = arr[i];
        }
        return body.instance_url + max.url;
    }
    else
        return "";
}

//Connect to Salesforce instance and obtain the Access Token used for subsequent Salesforce calls this session
function loginSalesforceNLAP() {

    //production
    var clientID = "432432432432432432432432ncK7FyfTUgxH2YNHvR6QPoVXpDE";
    var clientSecret = "732323213210608985";
    var securityToken = "N0bx9d323231aO321igJ6";
    var username = "login@login.com";
    var password = "password";
    var loginURL = "https://login.salesforce.com/services/oauth2/token";

    var header = [];
    header['Content-Type'] = 'application/json;charset=UTF-8';
    var recordData = {};
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