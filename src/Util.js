const Constants = require('./Constants');

var request = require("request");

const callHttpApi = function(log, urlToCall, urlMethod, urlBody, urlForm, urlHeaders, rejectUnauthorized, homeKitCallback, context, onSuccessCallback, onFailureCallback, timeout) {
	if (urlToCall !== "" && context !== Constants.CONTEXT_FROM_WEBHOOK) {
		var theRequest = {
			method : urlMethod,
			url : urlToCall,
			timeout : timeout || Constants.DEFAULT_REQUEST_TIMEOUT,
			headers : JSON.parse(urlHeaders),
			rejectUnauthorized: rejectUnauthorized
		};
		if (urlMethod === "POST" || urlMethod === "PUT" || urlMethod === "PATCH") {
			if (urlForm) {
				log("Adding Form " + urlForm);
				theRequest.form = JSON.parse(urlForm);
			}
			else if (urlBody) {
				log("Adding Body " + urlBody);
				theRequest.body = urlBody;
			}
		}
		request(theRequest, (function(err, response, body) {
			var statusCode = response && response.statusCode ? response.statusCode : -1;
			log("Request to '%s' finished with status code '%s' and body '%s'.", urlToCall, statusCode, body, err);
			if (!err && statusCode >= 200 && statusCode < 300) {
				if (onSuccessCallback) {
					onSuccessCallback();
				}
				homeKitCallback(null);
			}
			else {
				if (onFailureCallback) {
					onFailureCallback();
				}
				homeKitCallback(err || new Error("Request to '" + urlToCall + "' was not succesful."));
			}
		}).bind(this));
	}
	else {
		if (onSuccessCallback) {
			onSuccessCallback();
		}
		homeKitCallback(null);
	}
};

const callRemoApi = function(log, api, urlToCall, urlBody, urlHeaders, homeKitCallback, context, timeout) {
	var theRequest = {
		method : "POST",
		timeout : 10000
	};
	if (api == "cloud") {
		log.debug("Request signal ID '%s'.", urlToCall);
		theRequest.url = "https://api.nature.global/1/signals/" + urlToCall + "/send";
		theRequest.headers = {
			"Authorization" : "Bearer " + urlHeaders,
			"Accept" : "application/json",
			"Content-Type" : "application/x-www-form-urlencoded"
		};
	} else {
		log.debug("Request data '%s'.", urlBody);
		theRequest.timeout = 1000;
		theRequest.url = urlToCall;
		theRequest.headers = {
			"X-Requested-With" : "XMLHttpRequest",
			"Accept" : "application/json",
			"Content-Type" : "application/json"
		};
		theRequest.body = urlBody;
	}
	request(theRequest, (function(err, response, body) {
		var statusCode = response && response.statusCode ? response.statusCode : -1;
		if (!err && statusCode >= 200 && statusCode < 300) {
			log("Request to '%s' finished with status code '%s' and body '%s'.", theRequest.url, statusCode, body);
			homeKitCallback(null);
		}
		else {
			log("Request to '%s' failed with error code '%s'.", theRequest.url, err.code);
			callRemoApi(log, api, urlToCall, urlBody, urlHeaders, homeKitCallback, context, timeout);
		}
	}).bind(this));
};

module.exports = {
	callHttpApi : callHttpApi,
	callRemoApi : callRemoApi
};