/**
*@NApiVersion 2.x
*@NScriptType ScheduledScript
* 
* Author: Kevin Doss
* Date: 04/07/2022
* Description:
* Scheduled script to persist Hubspot saved searches and store them in the file cabinet.
* 
* 
*/
define(['N/task', 'N/log', 'N/email'],

function(task, log, email) {

  function execute(context) {

    try {

      var searches = [{fileid:'13589846',searchid:'customsearch5152'},{fileid:'13589847',searchid:'customsearch5153'},{fileid:'13589848',searchid:'customsearch5157'},{fileid:'13589852',searchid:'customsearch5154'},{fileid:'13590155',searchid:'customsearch5158'},{fileid:'13590258',searchid:'customsearch5156'}];

      for(var i=0; i<searches.length; i++) {

        var searchTask = task.create({
          taskType: task.TaskType.SEARCH
        });
        searchTask.savedSearchId = searches[i].searchid; 
        searchTask.fileId = searches[i].fileid;

        var taskId = searchTask.submit();

        log.audit('Task submitted for '+searches[i].searchid+': '+taskId);
        //log.audit('Status of '+searches[i].searchid+': '+task.checkStatus({taskId:taskId}).status);

      }
    }
    catch(e) {
      log.error({
        title: e.code,
        details: e.message
      });
      var subject = 'ERROR Persisting Search File to File Cabinet';
      var authorId = 6;
      var recipientEmail = 'kevind@overturepromo.com';
      email.send({
        author: authorId,
        recipients: recipientEmail,
        subject: subject,
        body: 'Fatal error occurred in script: ' + runtime.getCurrentScript().id + '\n\n' + JSON.stringify(e)
      });
    }

  }
  return {
    execute: execute
  };
});