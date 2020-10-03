const Constants = require('../../Constants');
const Util = require('../../Util');

function HttpWebHookHeaterCoolerAccessory(ServiceParam, CharacteristicParam, platform, heaterCoolerConfig) {
  Service = ServiceParam;
  Characteristic = CharacteristicParam;

  this.platform = platform;
  this.log = platform.log;
  this.storage = platform.storage;

  this.id = heaterCoolerConfig["id"];
  this.name = heaterCoolerConfig["name"];
  this.type = "heatercooler";
  this.setActiveURL = heaterCoolerConfig["set_active_url"] || "";
  this.setActiveMethod = heaterCoolerConfig["set_active_method"] || "GET";
  this.setActiveBody = heaterCoolerConfig["set_active_body"] || "";
  this.setActiveForm = heaterCoolerConfig["set_active_form"] || "";
  this.setActiveHeaders = heaterCoolerConfig["set_active_headers"] || "{}";
  this.setTargetHeaterCoolerStateURL = heaterCoolerConfig["set_target_heater_cooler_state_url"] || "";
  this.setTargetHeaterCoolerStateMethod = heaterCoolerConfig["set_target_heater_cooler_state_method"] || "GET";
  this.setTargetHeaterCoolerStateBody = heaterCoolerConfig["set_target_heater_cooler_state_body"] || "";
  this.setTargetHeaterCoolerStateForm = heaterCoolerConfig["set_target_heater_cooler_state_form"] || "";
  this.setTargetHeaterCoolerStateHeaders = heaterCoolerConfig["set_target_heater_cooler_state_headers"] || "{}";

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "HttpWebHooksPlatform");
  this.informationService.setCharacteristic(Characteristic.Model, "HttpWebHookHeaterCoolerAccessory-" + this.name);
  this.informationService.setCharacteristic(Characteristic.SerialNumber, "HttpWebHookHeaterCoolerAccessory-" + this.id);

  this.service = new Service.HeaterCooler(this.name);
  this.service.getCharacteristic(Characteristic.Active).on('get', this.getActive.bind(this)).on('set', this.setActive.bind(this));
  this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).on('get', this.getCurrentHeaterCoolerState.bind(this));
  this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState).on('get', this.getTargetHeaterCoolerState.bind(this)).on('set', this.setTargetHeaterCoolerState.bind(this));
  this.service.getCharacteristic(Characteristic.CurrentTemperature).on('get', this.getCurrentTemperature.bind(this));
}

HttpWebHookHeaterCoolerAccessory.prototype.changeFromServer = function(urlParams) {
  if (urlParams.currenttemperature != null) {
    var cachedCurTemp = this.storage.getItemSync("http-webhook-current-temperature-" + this.id);
    if (cachedCurTemp === undefined) {
      cachedCurTemp = 0;
    }
    this.storage.setItemSync("http-webhook-current-temperature-" + this.id, urlParams.currenttemperature);
    if (cachedCurTemp !== urlParams.currenttemperature) {
      this.log("Change current temperature for heater cooler to '%d'.", urlParams.currenttemperature);
      this.service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(urlParams.currenttemperature, undefined, Constants.CONTEXT_FROM_WEBHOOK);
    }
  }
  if (urlParams.targetstate != null) {
    var cachedState = this.storage.getItemSync("http-webhook-target-heater-cooler-state-" + this.id);
    if (cachedState === undefined) {
      cachedState = Characteristic.TargetHeaterCoolerState.AUTO;
    }
    this.storage.setItemSync("http-webhook-target-heater-cooler-state-" + this.id, urlParams.targetstate);
    if (cachedState !== urlParams.targetstate) {
      this.log("Change target heater cooler state for heater cooler to '%d'.", urlParams.targetstate);
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(urlParams.targetstate, undefined, Constants.CONTEXT_FROM_WEBHOOK);
    }
  }
  if (urlParams.currentstate != null) {
    var cachedState = this.storage.getItemSync("http-webhook-current-heater-cooler-state-" + this.id);
    if (cachedState === undefined) {
      cachedState = Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, urlParams.currentstate);
    if (cachedState !== urlParams.currentstate) {
      if (urlParams.currentstate) {
        this.log("Change current heater cooler state for heater cooler to '%s'.", urlParams.currentstate);
        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(urlParams.currentstate, undefined, Constants.CONTEXT_FROM_WEBHOOK);
      }
    }
  }
  if (urlParams.active != null) {
    var cachedState = this.storage.getItemSync("http-webhook-active-" + this.id);
    if (cachedState === undefined) {
      cachedState = Characteristic.Active.INACTIVE;
    }
    this.storage.setItemSync("http-webhook-active-" + this.id, urlParams.active);
    if (cachedState !== urlParams.active) {
      if (urlParams.active) {
        this.log("Change active for heater cooler to '%s'.", urlParams.active);
        this.service.getCharacteristic(Characteristic.Active).updateValue(urlParams.active, undefined, Constants.CONTEXT_FROM_WEBHOOK);
      }
    }
  }
  return {
    "success" : true
  };
}

HttpWebHookHeaterCoolerAccessory.prototype.getActive = function(callback) {
  this.log("Getting active for '%s'...", this.id);
  var state = this.storage.getItemSync("http-webhook-active-" + this.id);
  if (state === undefined) {
    state = Characteristic.Active.INACTIVE;
  }
  callback(null, state);
};

HttpWebHookHeaterCoolerAccessory.prototype.setActive = function(state, callback, context) {
  this.log("Active for '%s'...", this.id);
  this.storage.setItemSync("http-webhook-active-" + this.id, state);
  var urlToCall = this.setActiveURL.replace("%f", state);
  var urlMethod = this.setActiveMethod;
  var urlBody = this.setActiveBody;
  var urlForm = this.setActiveForm;
  var urlHeaders = this.setActiveHeaders;

  Util.callHttpApi(this.log, urlToCall, urlMethod, urlBody, urlForm, urlHeaders, callback, context);
};

HttpWebHookHeaterCoolerAccessory.prototype.getCurrentHeaterCoolerState = function(callback) {
  this.log("Getting current heater cooler state for '%s'...", this.id);
  var state = this.storage.getItemSync("http-webhook-current-heater-cooler-state-" + this.id);
  if (state === undefined) {
    state = Characteristic.CurrentHeaterCoolerState.INACTIVE;
  }
  callback(null, state);
};

HttpWebHookHeaterCoolerAccessory.prototype.getTargetHeaterCoolerState = function(callback) {
  this.log("Getting target heater cooler state for '%s'...", this.id);
  var state = this.storage.getItemSync("http-webhook-target-heater-cooler-state-" + this.id);
  if (state === undefined) {
    state = Characteristic.TargetHeaterCoolerState.AUTO;
  }
  callback(null, state);
};

HttpWebHookHeaterCoolerAccessory.prototype.setTargetHeaterCoolerState = function(state, callback, context) {
  this.log("Target heater cooler state for '%s'...", this.id);
  this.storage.setItemSync("http-webhook-target-heater-cooler-state-" + this.id, state);
  var urlToCall = this.setTargetHeaterCoolerStateURL.replace("%f", state);
  var urlMethod = this.setTargetHeaterCoolerStateMethod;
  var urlBody = this.setTargetHeaterCoolerStateBody;
  var urlForm = this.setTargetHeaterCoolerStateForm;
  var urlHeaders = this.setTargetHeaterCoolerStateHeaders;

  Util.callHttpApi(this.log, urlToCall, urlMethod, urlBody, urlForm, urlHeaders, callback, context);
};

HttpWebHookHeaterCoolerAccessory.prototype.getCurrentTemperature = function(callback) {
  this.log("Getting current temperature for '%s'...", this.id);
  var temp = this.storage.getItemSync("http-webhook-current-temperature-" + this.id);
  if (temp === undefined) {
    temp = 20;
  }
  callback(null, temp);
};

HttpWebHookHeaterCoolerAccessory.prototype.getServices = function() {
  return [ this.service, this.informationService ];
};

module.exports = HttpWebHookHeaterCoolerAccessory;
