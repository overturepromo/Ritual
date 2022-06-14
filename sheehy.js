/*
 *Author: Kevin Doss
 *Date: 6/27/2018 - updated 10/17/2019
 *Description: RESTlet to return Estimates, SOs, and Invoices to Sheehy (GET) and process payments (POST) against those records.
 * 
*/
/*jshint sub:true*/

var Events = {

	findTransaction: function(tranid,recType,emailDomain) {

		var filters = [];
		var columns = [];
		var recCode = null;

		//determine record type and alter search variables accordingly
		if(recType === 'estimate') {
			recCode = 'Estimate';
		}
		else if(recType === 'salesorder') {
      recCode = 'SalesOrd';
		}
		else {
			recCode = 'CustInvc';
		}

		filters.push(['type','anyof',recCode]);
		filters.push('AND');
		filters.push(['numbertext','is',tranid]);
		filters.push('AND');
		filters.push(['mainline','is','T']);
		filters.push('AND');
    filters.push([['custbody_customer_email','contains',emailDomain],'OR',['custbody_contact_email','contains',emailDomain]]);
    
    //added 2/21/2020 to exclude SOs in billed, cancelled, closed statuses
    if(recType === 'salesorder') {
      filters.push('AND');
      filters.push( ['status','noneof','SalesOrd:G','SalesOrd:C','SalesOrd:H']);
    }

		var results = nlapiSearchRecord(recType,null,[filters],columns);

		if(results) {
			nlapiLogExecution('AUDIT',recCode+' FOUND','internal id: '+results[0].getId().toString());
			return results[0].getId();
		}
		else {
			throw nlapiCreateError('NO_MATCH','No matching Transaction found.');
		}
	},

	findTotalPaid: function(transactionId,recType) {

		var searchType = null;
		var filters = [];
		var columns = [];
		var results = null;
		var totalPaid = 0.00;

		//determine record type and alter search variables accordingly
		if(recType === 'estimate') {
			searchType = 'customrecord_estimate_deposit';
			filters.push(['custrecord_parent_estimate','anyof', transactionId]);
			columns.push(new nlobjSearchColumn('custrecord_date_applied'));
			columns.push(new nlobjSearchColumn('custrecord_amount'));

			results = nlapiSearchRecord(searchType,null,[filters],columns);

			if(results) {
				for(var i=0; i<results.length; i++){
					totalPaid += parseFloat(results[i].getValue('custrecord_amount'));
				}
			}
		}
		else if(recType === 'salesorder') {
			searchType = 'customerdeposit';
			filters.push(['type','anyof','CustDep']);
			filters.push('AND');
			filters.push(['mainline','is','T']);
			filters.push('AND');
			filters.push(['salesorder','anyof',transactionId]);
			columns.push(new nlobjSearchColumn('amount'));

			results = nlapiSearchRecord(searchType,null,[filters],columns);

			if(results) {
				for(var x=0; x<results.length; x++){
					totalPaid += parseFloat(results[x].getValue('amount'));
				}
			}
		}
		else {
			searchType = 'invoice';
			filters.push(['type','anyof','CustInvc']);
			filters.push('AND');
			filters.push(['mainline','is','T']);
			filters.push('AND');
			filters.push(['internalid','anyof',transactionId]);
			columns.push(new nlobjSearchColumn('amountremaining'));
			columns.push(new nlobjSearchColumn('amount'));

			results = nlapiSearchRecord(searchType,null,[filters],columns);

			if(results) {
				totalPaid = parseFloat(results[0].getValue('amount') - results[0].getValue('amountremaining'));
			}
		}

		nlapiLogExecution('AUDIT','TOTAL PAID',totalPaid.toString());

		return totalPaid;
	},

	getEstimateDeposits: function(transactionId) {

		var deposits = null;
		var filters = [];
		var columns = [];
		filters.push(['custrecord_parent_estimate','anyof', transactionId]);
		columns.push(new nlobjSearchColumn('custrecord_amount'));

		deposits =  nlapiSearchRecord('customrecord_estimate_deposit',null,[filters],columns);

		return deposits;
	},

	POST: function(payload) {

		var responseObj = {
			error:{
				code:null,
				message:null
			},
			successful:false,
			estimateid:null,
			total:null,
			amount_paid:null,
			balance_due:null,
			estimate_payment_record:null
		};

		try {

			nlapiLogExecution('AUDIT','Data',JSON.stringify(payload));

			var recType = null;
			var prefix = payload.tranid.substring(0,2);

			//check record type
			if(prefix.toLowerCase() === 'es') {
				recType = 'estimate';
			}
			else if (prefix.toLowerCase() === 'so') {
				recType = 'salesorder';
			}
			else if (prefix.toLowerCase() === 'in'){
				recType = 'invoice';
			}
			else {
				throw nlapiCreateError('BAD_PREFIX', 'Transaction prefix not ES, SO, or IN.');
			}

			var emailDomain = payload.email.replace(/.*@/, '');
			var transactionId = Events.findTransaction(payload.tranid,recType,emailDomain);
			var body = null;
			

			if(recType === 'estimate') {

				var estimateTotal = parseFloat(nlapiLookupField('estimate',transactionId,'total'));
				var soId = null;

				//create Estimate Deposit (custom record)
				var date = new Date();
				var dateString = (date.getMonth()+1)+'/'+date.getDate()+'/'+date.getFullYear();
				var estDeposit = nlapiCreateRecord('customrecord_estimate_deposit', {recordmode:'dynamic'});
				estDeposit.setFieldValue('custrecord_parent_estimate', transactionId);
				estDeposit.setFieldValue('custrecord_amount', parseFloat(payload.total.replace(/,/g, '')));
				estDeposit.setFieldValue('custrecord_date_applied', dateString);
				estDeposit.setFieldValue('custrecord_pnrefnum', payload.pnrefnum);
				estDeposit.setFieldValue('custrecord_cc_auth_code', payload.custbody_cc_auth_code);
				estDeposit.setFieldValue('custrecord_cc_expire_date', payload.custbody_cc_expire_date);
				if(payload.custbody_cc_type) {
					estDeposit.setFieldValue('custrecord_cc_type', payload.custbody_cc_type);
				}

				var estDepId = nlapiSubmitRecord(estDeposit, false, true);
				responseObj.estimateid = transactionId;
				responseObj.estimate_payment_record = estDepId;

				var estTotalPaid = parseFloat(Events.findTotalPaid(transactionId,recType));

				nlapiSubmitField('estimate',transactionId,'custbody_total_deposits',estTotalPaid);

				responseObj.total = estimateTotal.toFixed(2);
				responseObj.amount_paid = estTotalPaid.toFixed(2);
				responseObj.balance_due = (estimateTotal - estTotalPaid).toFixed(2);

				//only proceed if cumulative total of deposits against estimate covers total - else
				//send email to sales rep
				if(estTotalPaid >= estimateTotal) {

					//transform estimate to sales order
					var so = nlapiTransformRecord('estimate',transactionId,'salesorder',{'customform':160});
					soId = nlapiSubmitRecord(so);

					//set payment info on new sales order
					var paymentInfo = '';
		  		paymentInfo += 'IS PRE-AUTH: No'+ '\r\n';
		  		paymentInfo += 'EXPIRES (MM/YYYY) '+payload.custbody_cc_expire_date+'\r\n';
		  		paymentInfo += 'AUTH. CODE: '+payload.custbody_cc_auth_code+'\r\n';
		  		paymentInfo += 'P/N REF. '+payload.pnrefnum+'\r\n';
		  		paymentInfo += 'CREDIT CARD APPROVED: Yes'+'\r\n';
		  		paymentInfo += 'CUSTOMER CODE: 5199';

		  		nlapiSubmitField('salesorder',soId,'custbody_integration_payment_info',paymentInfo);

					//create deposit(s) against that sales order
					var deposits = Events.getEstimateDeposits(transactionId);

					for(var i=0; i<deposits.length; i++) {

						var deposit = nlapiCreateRecord('customerdeposit', {recordmode:'dynamic'});
						deposit.setFieldValue('customer', nlapiLookupField('salesorder',soId,'entity'));
						deposit.setFieldValue('salesorder',soId);
						deposit.setFieldValue('payment',parseFloat(deposits[i].getValue('custrecord_amount')));
						deposit.setFieldText('paymentmethod',payload.custbody_cc_type);
						deposit.setFieldValue('ccexpiredate',payload.custbody_cc_expire_date);
						deposit.setFieldValue('authcode',payload.custbody_cc_auth_code);
						deposit.setFieldValue('pnrefnum',payload.pnrefnum);
						deposit.setFieldValue('ccapproved','T');
						deposit.setFieldValue('chargeit','F');

						//Integration Payment Info (different from same fields on SO)
						deposit.setFieldText('custbody_payment_method_int_dep',payload.custbody_cc_type);
						var depPaymentInfo = '';
						depPaymentInfo += 'IS PRE-AUTH: No'+ '\r\n';
						depPaymentInfo += 'EXPIRES (MM/YYYY) '+payload.custbody_cc_expire_date+'\r\n';
						depPaymentInfo += 'AUTH. CODE: '+payload.custbody_cc_auth_code+'\r\n';
						depPaymentInfo += 'P/N REF. '+payload.pnrefnum+'\r\n';
						depPaymentInfo += 'CREDIT CARD APPROVED: Yes'+'\r\n';
						depPaymentInfo += 'CUSTOMER CODE: 5199';

						deposit.setFieldValue('custbody_payment_info_int_dep',depPaymentInfo);

						nlapiSubmitRecord(deposit, false, true);
					}
					
					responseObj.successful = true;
				}
				else {
					responseObj.successful = true;
				}

				body = 'A payment of $'+payload.total+' has been deposited on Estimate '+nlapiLookupField('estimate',transactionId,'tranid')+' for customer '+nlapiLookupField('estimate',transactionId,'entity',true)+'.\r\n';
				body += 'Total: $'+estimateTotal.toFixed(2)+'\r\n';
				body += 'This Payment: $'+payload.total+'\r\n';
				body += 'Paid to Date: $'+estTotalPaid.toFixed(2)+'\r\n';
				body += 'Balance Due: $'+(estimateTotal - estTotalPaid).toFixed(2)+'\r\n';
				body += 'Link to Estimate in Netsuite: '+'https://system.na1.netsuite.com'+nlapiResolveURL('record','estimate',transactionId,'view')+'\r\n';
				if(soId !== null) {
					body += 'NOTE: If Balance Due is zero, you can find the new Sales Order cut from this Estimate under Related Records: '+nlapiLookupField('salesorder',soId,'tranid');
				}

				nlapiSendEmail(
					6,
					nlapiLookupField('estimate',transactionId,'custbody_entered_by_email'),
					'Payment made on Estimate '+nlapiLookupField('estimate',transactionId,'tranid')+'.',
					body,
					null,
					null,
					null,
					null,
					true
				);
			}

			else if(recType === 'salesorder') {

				var createSoDeposit = function(entity,transactionId,total) {

					var deposit = nlapiCreateRecord('customerdeposit', {recordmode:'dynamic'});
					deposit.setFieldValue('customer',entity);
					deposit.setFieldValue('salesorder',transactionId);
					deposit.setFieldValue('payment',total);
					deposit.setFieldText('paymentmethod',payload.custbody_cc_type);
					deposit.setFieldValue('ccexpiredate',payload.custbody_cc_expire_date);
					deposit.setFieldValue('authcode',payload.custbody_cc_auth_code);
					deposit.setFieldValue('pnrefnum',payload.pnrefnum);
					deposit.setFieldValue('ccapproved','T');
					deposit.setFieldValue('chargeit','F');

					//Integration Payment Info (different from same fields on SO)
					deposit.setFieldText('custbody_payment_method_int_dep',payload.custbody_cc_type);
					var depPaymentInfo = '';
					depPaymentInfo += 'IS PRE-AUTH: No'+ '\r\n';
					depPaymentInfo += 'EXPIRES (MM/YYYY) '+payload.custbody_cc_expire_date+'\r\n';
					depPaymentInfo += 'AUTH. CODE: '+payload.custbody_cc_auth_code+'\r\n';
					depPaymentInfo += 'P/N REF. '+payload.pnrefnum+'\r\n';
					depPaymentInfo += 'CREDIT CARD APPROVED: Yes'+'\r\n';
					depPaymentInfo += 'CUSTOMER CODE: 5199';

					deposit.setFieldValue('custbody_payment_info_int_dep',depPaymentInfo);

					var depositId = nlapiSubmitRecord(deposit, false, true);

					return depositId;
				};

				var entity = nlapiLookupField('salesorder',transactionId,'entity');
				var soTotal = nlapiLookupField('salesorder',transactionId,'total');
				var totalPaid = Events.findTotalPaid(transactionId,recType);
				var salesRep = nlapiLookupField('salesorder',transactionId,'custbody_entered_by_email');

				if(totalPaid < parseFloat(soTotal)) {
					if(parseFloat(payload.total) <= (parseFloat(soTotal) - totalPaid).toFixed(2)){
						var depositId = createSoDeposit(entity,transactionId,payload.total);
						responseObj.estimateid = depositId;
						responseObj.successful = true;
						responseObj.total = soTotal;
						responseObj.amount_paid = payload.total;
						responseObj.balance_due = (parseFloat(soTotal) - (totalPaid+payload.total)).toFixed(2);

						body = 'A payment of $'+payload.total+' has been deposited on Sales Order '+nlapiLookupField('salesorder',transactionId,'tranid')+' for customer '+nlapiLookupField('salesorder',transactionId,'entity',true)+'.\r\n';
						body += 'Total: $'+soTotal+'\r\n';
						body += 'This Payment: $'+payload.total+'\r\n';
						body += 'Paid to date: $'+(totalPaid + parseFloat(payload.total)).toFixed(2)+'\r\n';
						body += 'Balance Due: $'+(parseFloat(soTotal) - (totalPaid + parseFloat(payload.total))).toFixed(2)+'\r\n';
						body += 'Link to Sales Order in Netsuite: '+'https://system.na1.netsuite.com'+nlapiResolveURL('record','salesorder',transactionId,'view')+'\r\n';

						nlapiSendEmail(
							6,
							salesRep,
							'Payment made on SO '+nlapiLookupField('salesorder',transactionId,'tranid')+'.',
							body,
							null,
							null,
							null,
							null,
							true
						);
					}
					else {
						throw nlapiCreateError('OVERPAYMENT', 'The attempted payment is more than the amount due on this Sales Order.');
					}
				}
				else {
					throw nlapiCreateError('PAID_IN_FULL', 'This Sales Order has already been paid in full.');
				}
			}

			else {

				var createCustPayment = function(transactionId,total) {

					var paymentRec =  nlapiTransformRecord('invoice',transactionId,'customerpayment', {'customform':127});
					paymentRec.setFieldValue('payment',total);
          
          //loop through available invoices to apply payment to
          //and match to tranid passed in payload
          for(var x=1; x<=paymentRec.getLineItemCount('apply'); x++) {
            if(paymentRec.getLineItemValue('apply','refnum',x) == payload.tranid) {
              paymentRec.setLineItemValue('apply','amount',x,total);
            }
          }
					
					paymentRec.setFieldText('paymentmethod',payload.custbody_cc_type);
					paymentRec.setFieldValue('ccexpiredate',payload.custbody_cc_expire_date);
					paymentRec.setFieldValue('authcode',payload.custbody_cc_auth_code);
					paymentRec.setFieldValue('pnrefnum',payload.pnrefnum);
					paymentRec.setFieldValue('ccapproved','T');
					paymentRec.setFieldValue('chargeit','F');

					var invPaymentInfo = '';
					invPaymentInfo += 'IS PRE-AUTH: No'+ '\r\n';
					invPaymentInfo += 'EXPIRES (MM/YYYY) '+payload.custbody_cc_expire_date+'\r\n';
					invPaymentInfo += 'AUTH. CODE: '+payload.custbody_cc_auth_code+'\r\n';
					invPaymentInfo += 'P/N REF. '+payload.pnrefnum+'\r\n';
					invPaymentInfo += 'CREDIT CARD APPROVED: Yes'+'\r\n';
					invPaymentInfo += 'CUSTOMER CODE: 5199';

					paymentRec.setFieldText('custbody_payment_method_int_invoice',payload.custbody_cc_type);
					paymentRec.setFieldValue('custbody_payment_info_int_invoice',invPaymentInfo);
					
					var paymentId = nlapiSubmitRecord(paymentRec);

					return paymentId;
				};

				var invEntity = nlapiLookupField('invoice',transactionId,'entity');
				var invTotal = nlapiLookupField('invoice',transactionId,'total');
				var invTotalPaid = Events.findTotalPaid(transactionId,recType);

				if(invTotalPaid < parseFloat(invTotal)) {
					if(parseFloat(payload.total) <= (parseFloat(invTotal) - invTotalPaid).toFixed(2)) {
						var paymentId = createCustPayment(transactionId,payload.total);
						responseObj.estimateid = paymentId;
						responseObj.successful = true;
						responseObj.total = invTotal;
						responseObj.amount_paid = payload.total;
						responseObj.balance_due = (parseFloat(invTotal) - (invTotalPaid+payload.total)).toFixed(2);

						body = 'A payment of $'+payload.total+' has been made against Invoice '+nlapiLookupField('invoice',transactionId,'tranid')+' for customer '+nlapiLookupField('invoice',transactionId,'entity',true)+'.\r\n';
						body += 'Total: $'+invTotal+'\r\n';
						body += 'This Payment: $'+payload.total+'\r\n';
						body += 'Paid to date: $'+(invTotalPaid + parseFloat(payload.total)).toFixed(2)+'\r\n';
						body += 'Balance Due: $'+(parseFloat(invTotal) - (invTotalPaid + parseFloat(payload.total))).toFixed(2)+'\r\n';
						body += 'Link to Invoice in Netsuite: '+'https://system.na1.netsuite.com'+nlapiResolveURL('record','invoice',transactionId,'view')+'\r\n';

						nlapiSendEmail(
							6,
							'lisab@overturepromo.com',
							'Payment made on Invoice '+nlapiLookupField('invoice',transactionId,'tranid')+'.',
							body,
							null,
							null,
							null,
							null,
							true
						);

					}
					else {
						throw nlapiCreateError('OVERPAYMENT', 'The attempted payment is more than the amount due on this Invoice.');
					}
				}
				else {
					throw nlapiCreateError('PAID_IN_FULL', 'This Invoice has already been paid in full.');
				}
			}
		
			return responseObj;
		}
		catch(e) {

			if (e instanceof nlobjError) {
 				nlapiLogExecution('ERROR', 'Netsuite Error', e.getCode() + ' - ' + e.getDetails());
 				responseObj.error.code = e.getCode();
 				responseObj.error.message = e.getDetails();
 				responseObj.successful = false;
			}
			else {
				var error = nlapiCreateError(e.code, e.message);
				nlapiLogExecution('ERROR','Unexpected Error',error);
				responseObj.error.code = e.code;
				responseObj.error.message = e.message;
				responseObj.successful = false;
			}
          
      nlapiSendEmail(
				6,
				'kevind@overturepromo.com',
				'Problem processing payment: '+e.code+' :: '+e.message+'\r\nSee OP_RLET_EstimateProcessing.js logs',
				e.code+' :: '+e.message,
				null,
				null,
				null,
				null,
				true
			);

			return responseObj;
		}
	},

	GET: function(payload) {
	
		var responseObj = {
			error:{
				code:null,
				message:null
			},
			successful: false,
			estimate: null
		};

		try {

			nlapiLogExecution('AUDIT','Data',JSON.stringify(payload));

			var recType = null;
			var prefix = payload.tranid.substring(0,2);

			//check record type
			if(prefix.toLowerCase() === 'es') {
				recType = 'estimate';
			}
			else if (prefix.toLowerCase() === 'so') {
				recType = 'salesorder';
			}
			else if (prefix.toLowerCase() === 'in'){
				recType = 'invoice';
			}
			else {
				throw nlapiCreateError('BAD_PREFIX', 'Transaction prefix not ES, SO, or IN.');
			}

			var emailDomain = payload.email.replace(/.*@/, '');
			var transactionId = Events.findTransaction(payload.tranid,recType,emailDomain);
			var rec = nlapiLoadRecord(recType,transactionId);
			var total = rec.getFieldValue('total');
			var amountPaid = Events.findTotalPaid(transactionId,recType);
			var balanceDue = parseFloat(total) - parseFloat(amountPaid);

			//create "view" record to maintain running history of client views
			//on estimates, regardless if payment is made
			if(recType === 'estimate') {
				var view = nlapiCreateRecord('customrecord_estimate_views', {recordmode:'dynamic'});
				view.setFieldValue('custrecord_parent_estimate_view',transactionId);
				nlapiSubmitRecord(view);
			}
			
			if(balanceDue < 0.01) {
				throw nlapiCreateError('PAID_IN_FULL','This transaction has already been paid in full.');
			}

			responseObj.successful = true;

			var lines = [];
			for(var i=1; i<=rec.getLineItemCount('item'); i++) {

				if(rec.getLineItemValue('item','custcol_extend_hidefromprinting',i) == 'F') {

					lines.push({
						item: rec.getLineItemValue('item','item',i),
						description: rec.getLineItemValue('item','description',i),
						color: rec.getLineItemValue('item','custcolitemcolor',i),
						size: rec.getLineItemText('item','custcolitemsize',i),
						rate: rec.getLineItemValue('item','rate',i),
						quantity: rec.getLineItemValue('item','quantity',i),
						amount: rec.getLineItemValue('item','amount',i),
					});

				}
			}

			var email = null;

			if(rec.getFieldValue('custbody_customer_email') !== '' && rec.getFieldValue('custbody_customer_email') !== null) {
				email = rec.getFieldValue('custbody_customer_email');
			}
			else {
				email = rec.getFieldValue('custbody_contact_email');
			}

			var estimate = {
				trandate: rec.getFieldValue('trandate'),
				subtotal: rec.getFieldValue('subtotal'),
				taxtotal: rec.getFieldValue('taxtotal'),
				shiptotal: rec.getFieldValue('shippingcost'),
				total: total,
				amount_paid: amountPaid.toFixed(2),
				balance_due: balanceDue.toFixed(2),
				customer:{
					email: email,
				},
				salesrep:{
					name: rec.getFieldText('custbody_sales_rep_entered_by'),
					email: rec.getFieldValue('custbody_entered_by_email'),
					phone: rec.getFieldValue('custbody_entered_by_phone')
				},
				billing:{
					billaddressee: rec.getFieldValue('billaddressee'),
					billattention: rec.getFieldValue('billattention'),
					billaddr1: rec.getFieldValue('billaddr1'),
					billaddr2: rec.getFieldValue('billaddr2'),
					billaddr3: rec.getFieldValue('billaddr3'),
					billcity: rec.getFieldValue('billcity'),
					billstate: rec.getFieldValue('billstate'),
					billzip: rec.getFieldValue('billzip'),
					billcountry: rec.getFieldValue('billcountry'),
					billphone: rec.getFieldValue('billphone')
				},
				shipping:{
					shipaddressee: rec.getFieldValue('shipaddressee'),
					shipattention: rec.getFieldValue('shipattention'),
					shipaddr1: rec.getFieldValue('shipaddr1'),
					shipaddr2: rec.getFieldValue('shipaddr2'),
					shipaddr3: rec.getFieldValue('shipaddr3'),
					shipcity: rec.getFieldValue('shipcity'),
					shipstate: rec.getFieldValue('shipstate'),
					shipzip: rec.getFieldValue('shipzip'),
					shipcountry: rec.getFieldValue('shipcountry'),
					shipphone: rec.getFieldValue('shipphone')
				},
				lines:lines
			};

			if(recType === 'estimate') {
				rec.setFieldValue('custbody_total_deposits',amountPaid);
			}

			nlapiSubmitRecord(rec);

			responseObj.estimate = estimate;

			return responseObj;

		}
		catch(e) {

			if (e instanceof nlobjError) {
 				nlapiLogExecution('ERROR', 'Netsuite Error', e.getCode() + ' - ' + e.getDetails());
 				if(e.code !== undefined) {
 					responseObj.error.code = e.getCode();
 				}
 				responseObj.error.message = e.getDetails();
 				responseObj.successful = false;
			}
			else {
				var error = nlapiCreateError(e.code, e.message);
				nlapiLogExecution('ERROR','Unexpected Error',error);
				if(e.code !== undefined) {
					responseObj.error.code = e.code;
				}
				responseObj.error.message = e.message;
				responseObj.successful = false;
			}

			return responseObj;
		}
	},
	PUT: function(payload) {},
	DELETE: function(payload) {}

};