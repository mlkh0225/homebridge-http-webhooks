const Constants = require('../../Constants');
const Util = require('../../Util');

function HttpWebHookRemoAirconAccessory(ServiceParam, CharacteristicParam, platform, remoAirconConfig) {
	Service = ServiceParam;
	Characteristic = CharacteristicParam;
	
	this.platform = platform;
	this.log = platform.log;
	this.storage = platform.storage;
		
	this.type = "RemoAircon";
	this.id = remoAirconConfig["id"];
	this.name = remoAirconConfig["name"];
	
	this.environment = remoAirconConfig["environment"] || "cloud"
	this.remoURL = this.environment === "local" ? remoAirconConfig["base_url"] : "https://api.nature.global/1/signals/{id}/send";
	this.remoHeader = this.environment === "local" ?  "{\"X-Requested-With\":\"XMLHttpRequest\",\"Accept\":\"application/json\"}" : JSON.stringify(remoAirconConfig["base_header"]) ;
	
	this.services = [];
	
	const brand = remoAirconConfig["brand"] || "Nature Remo";
	const model = remoAirconConfig["model"] || this.name;
	const serial = remoAirconConfig["serial"] || this.type + "-" + this.id;
	
	this.informationService = new Service.AccessoryInformation();
	this.informationService.setCharacteristic(Characteristic.Manufacturer, brand);
	this.informationService.setCharacteristic(Characteristic.Model, model);
	this.informationService.setCharacteristic(Characteristic.SerialNumber, serial);
	this.services.push(this.informationService);

	this.functions = remoAirconConfig["functions"] || ["cool"]
	
	this.setActiveSignal = JSON.stringify(remoAirconConfig["off"]) || "";
	const valuesTargetHeaterCoolerState = this.functions.includes("warm") ? [
		Characteristic.TargetHeaterCoolerState.AUTO,
		Characteristic.TargetHeaterCoolerState.COOL,
		Characteristic.TargetHeaterCoolerState.HEAT
	] : [
		Characteristic.TargetHeaterCoolerState.AUTO,
		Characteristic.TargetHeaterCoolerState.COOL
	]
	this.currentTemperature = remoAirconConfig["currentTemperature"] || "current_temperature-" + this.id;
	this.coolingThresholdTemperatureSignal = remoAirconConfig["target_temperature_cool"] || "";
	this.heatingThresholdTemperatureSignal = remoAirconConfig["target_temperature_warm"] || "";
	this.tempMin = remoAirconConfig["minTemp"] || 15;
	this.tempMax = remoAirconConfig["maxTemp"] || 30;
	this.tempStep = remoAirconConfig["stepTemp"] || 0.5;
	
	this.airconService = new Service.HeaterCooler(this.name + " Aircon");
	this.airconService.getCharacteristic(Characteristic.Active).on('get', this.getAirconActive.bind(this)).on('set', this.setAirconActive.bind(this));
	this.airconService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).on('get', this.getCurrentHeaterCoolerState.bind(this));
	this.airconService.getCharacteristic(Characteristic.TargetHeaterCoolerState).on('get', this.getTargetHeaterCoolerState.bind(this)).on('set', this.setTargetHeaterCoolerState.bind(this)).setProps({
		validValues: valuesTargetHeaterCoolerState
	 });
	this.airconService.getCharacteristic(Characteristic.CoolingThresholdTemperature).on('get', this.getCoolingThresholdTemperature.bind(this)).on('set', this.setCoolingThresholdTemperature.bind(this)).setProps({
		minValue: this.tempMin,
		maxValue: this.tempMax,
		minStep: this.tempStep
	 });
	this.airconService.getCharacteristic(Characteristic.CurrentTemperature).on('get', this.getCurrentTemperature.bind(this));
	if (this.functions.includes("warm"))
		this.airconService.getCharacteristic(Characteristic.HeatingThresholdTemperature).on('get', this.getHeatingThresholdTemperature.bind(this)).on('set', this.setHeatingThresholdTemperature.bind(this)).setProps({
			minValue: this.tempMin,
			maxValue: this.tempMax,
			minStep: this.tempStep
		 });
	this.services.push(this.airconService);
	
	this.currentRelativeHumidity = remoAirconConfig["currentHumidity"] || "current-relative-humidity-" + this.id;
	this.setTargetHumidifierDehumidifierStateSignal = JSON.stringify(remoAirconConfig["dehumidifier"]) || "";
	
	if (this.functions.includes("dry")) {
		this.dehumidifierService = new Service.HumidifierDehumidifier(this.name + " Dehumidifier");
		this.dehumidifierService.getCharacteristic(Characteristic.Active).on('get', this.getDehumidifierActive.bind(this)).on('set', this.setDehumidifierActive.bind(this));
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).on('get', this.getCurrentHumidifierDehumidifierState.bind(this));
		this.dehumidifierService.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState).on('get', this.getTargetHumidifierDehumidifierState.bind(this)).on('set', this.setTargetHumidifierDehumidifierState.bind(this)).setProps({
			validValues: [
				Characteristic.TargetHumidifierDehumidifierState.AUTO,
				Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER
			]
		});
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentRelativeHumidity).on('get', this.getCurrentRelativeHumidity.bind(this));
		this.services.push(this.dehumidifierService);
	}
	
	this.fanRotationSpeedSignal = remoAirconConfig["rotation_speed_fan"] || [""];
	this.blowStep = 100 / this.fanRotationSpeedSignal.length;
	
	if (this.functions.includes("blow")) {
		this.fanService = new Service.Fanv2(this.name + " Fan");
		this.fanService.getCharacteristic(Characteristic.Active).on('get', this.getActive.bind(this)).on('set', this.setFanActive.bind(this));
		this.fanService.getCharacteristic(Characteristic.CurrentFanState).on('get', this.getCurrentFanState.bind(this));
		this.fanService.getCharacteristic(Characteristic.TargetFanState).on('get', this.getTargetFanState.bind(this)).on('set', this.setTargetFanState.bind(this));
		this.fanService.getCharacteristic(Characteristic.RotationSpeed).on('get', this.getFanRotationSpeed.bind(this)).on('set', this.setFanRotationSpeed.bind(this));
		this.services.push(this.fanService);
	}
}

HttpWebHookRemoAirconAccessory.prototype.changeFromServer = function(urlParams) {
	if (urlParams.active.aircon != null) {
		var cachedActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-aircon");
		if (cachedActive === undefined) {
			cachedActive = Characteristic.Active.INACTIVE;
		}
		this.storage.setItemSync("http-webhook-active-" + this.id + "-aircon", urlParams.active);
		if (cachedActive !== urlParams.active) {
			this.log("Active updated to '%s'.", urlParams.active);
			this.airconService.getCharacteristic(Characteristic.Active).updateValue(urlParams.active, undefined, Constants.CONTEXT_FROM_WEBHOOK);
		}
	}
	if (urlParams.active.dehumidifier != null && this.functions.includes("dry")) {
		var cachedActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-dehumidifier");
		if (cachedActive === undefined) {
			cachedActive = Characteristic.Active.INACTIVE;
		}
		this.storage.setItemSync("http-webhook-active-" + this.id + "-dehumidifier", urlParams.active);
		if (cachedActive !== urlParams.active) {
			this.log("Active updated to '%s'.", urlParams.active);
			this.dehumidifierService.getCharacteristic(Characteristic.Active).updateValue(urlParams.active, undefined, Constants.CONTEXT_FROM_WEBHOOK);
		}
	}
	if (urlParams.currenttemperature != null) {
		var cachedTemp = this.storage.getItemSync("http-webhook-" + this.currentTemperature);
		if (cachedTemp === undefined) {
			cachedTemp = 26.0;
		}
		this.storage.setItemSync("http-webhook-" + this.currentTemperature, urlParams.currenttemperature);
		if (cachedTemp !== urlParams.currenttemperature) {
			this.log("Change current temperature for aircon to '%d'.", urlParams.currenttemperature);
			this.airconService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(urlParams.currenttemperature, undefined, Constants.CONTEXT_FROM_WEBHOOK);
		}
	}
	if (urlParams.targettemperature != null) {
		var cachedTemp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
		if (cachedTemp === undefined) {
			cachedTemp = 26.0;
		}
		this.storage.setItemSync("http-webhook-target-temperature-" + this.id, urlParams.targettemperature);
		if (cachedTemp !== urlParams.targettemperature) {
			this.log("Change target temperature for aircon to '%d'.", urlParams.targettemperature);
			this.airconService.getCharacteristic(Characteristic.TargetTemperature).updateValue(urlParams.targettemperature, undefined, Constants.CONTEXT_FROM_WEBHOOK);
		}
	}
	if (urlParams.currentcoolingstate != null) {
		var cachedState = this.storage.getItemSync("http-webhook-current-heater-cooler-state-" + this.id);
		if (cachedState === undefined) {
			cachedState = Characteristic.CurrentHeatingCoolingState.OFF;
		}
		this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, urlParams.currentcoolingstate);
		if (cachedState !== urlParams.currentcoolingstate) {
			if (urlParams.currentcoolingstate) {
				this.log("Change current state for aircon to '%s'.", urlParams.currentcoolingstate);
				this.airconService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(urlParams.currentcoolingstate, undefined, Constants.CONTEXT_FROM_WEBHOOK);
			}
		}
	}
	if (urlParams.targetcoolingstate != null) {
		var cachedState = this.storage.getItemSync("http-webhook-target-heater-cooler-state-" + this.id);
		if (cachedState === undefined) {
			cachedState = Characteristic.TargetHeatingCoolingState.OFF;
		}
		this.storage.setItemSync("http-webhook-target-heater-cooler-state-" + this.id, urlParams.targetcoolingstate);
		if (cachedState !== urlParams.targetcoolingstate) {
			if (urlParams.targetcoolingstate) {
				this.log("Change target state for aircon to '%s'.", urlParams.targetcoolingstate);
				this.airconService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(urlParams.targetcoolingstate, undefined, Constants.CONTEXT_FROM_WEBHOOK);
			}
		}
	}
	if (urlParams.currentdehumidifierstate != null && this.dehumidifier) {
	var cachedState = this.storage.getItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id);
	if (cachedState === undefined) {
		cachedState = Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
	}
	this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, urlParams.currentdehumidifierstate);
	if (cachedState !== urlParams.currentdehumidifierstate) {
		if (urlParams.currentdehumidifierstate) {
		this.log("Change current state for dehumidifier to '%s'.", urlParams.currentdehumidifierstate);
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(urlParams.currentdehumidifierstate, undefined, Constants.CONTEXT_FROM_WEBHOOK);
		}
	}
	}
	if (urlParams.targetdehumidifierstate != null && this.dehumidifier) {
	var cachedState = this.storage.getItemSync("http-webhook-target-humidifier-dehumidifier-state-" + this.id);
	if (cachedState === undefined) {
		cachedState = Characteristic.TargetHumidifierDehumidifierState.AUTO;
	}
	this.storage.setItemSync("http-webhook-target-humidifier-dehumidifier-state-" + this.id, urlParams.targetdehumidifierstate);
	if (cachedState !== urlParams.targetdehumidifierstate) {
		if (urlParams.targetdehumidifierstate) {
		this.log("Change target state for dehumidifier to '%s'.", urlParams.targetdehumidifierstate);
		this.dehumidifierService.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState).updateValue(urlParams.targetdehumidifierstate, undefined, Constants.CONTEXT_FROM_WEBHOOK);
		}
	}
	}
	if (urlParams.currentrelativehumidity != null && this.dehumidifier) {
	var cachedHumd = this.storage.getItemSync("http-webhook-" + this.getHumidity);
	if (cachedHumd === undefined) {
		cachedHumd = 50;
	}
	this.storage.setItemSync("http-webhook-" + this.currentHumidity, urlParams.currentrelativehumidity);
	if (cachedHumd !== urlParams.currentrelativehumidity) {
		this.log("Change current humidity for dehumidifier to '%d'.", urlParams.currentrelativehumidity);
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(urlParams.currentrelativehumidity, undefined, Constants.CONTEXT_FROM_WEBHOOK);
	}
	}
	return {
		"success" : true
	};
}

HttpWebHookRemoAirconAccessory.prototype.getAirconActive = function(callback) {
	this.log.debug("[Aircon][%s] airconService getActive...", this.name);
	var active = this.storage.getItemSync("http-webhook-active-" + this.id + "-aircon");
	if (active === undefined) {
		active = Characteristic.Active.INACTIVE;
	}
	callback(null, active);
};

HttpWebHookRemoAirconAccessory.prototype.setAirconActive = function(active, callback, context) {
	this.log.debug("[Aircon][%s] airconService setActive to '%s'...", this.name, Boolean(active));
	var cachedActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-aircon");
	this.storage.setItemSync("http-webhook-active-" + this.id + "-aircon", parseInt(active));
	
	if (active && !cachedActive) {
		if (this.functions.includes("blow")) {
			var fanActive = this.storage.getItemSync("http-webhook-active-" + this.id);
			if (!fanActive) {
				this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.ACTIVE);
				this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
				this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
				this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
			}
			this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, Characteristic.TargetFanState.AUTO);
			this.fanService.getCharacteristic(Characteristic.TargetFanState).updateValue(Characteristic.TargetFanState.AUTO);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, 50);
			this.fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(50);
		}
		var dehumidifierActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-dehumidifier");
		if (this.functions.includes("dry") && dehumidifierActive) {
			this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
			this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
			this.storage.setItemSync("http-webhook-active-" + this.id + "-dehumidifier", Characteristic.Active.INACTIVE);
			this.dehumidifierService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
		}
		var temp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
		var currentTemp = this.storage.getItemSync("http-webhook-" + this.currentTemperature);
		this.log("[Aircon][%s] Setting target temperature to '%d'...", this.name, temp);
		if (temp > currentTemp && this.functions.includes("warm")) {
			this.log("[Aircon][%s][Heat Mode]...", this.name);
			this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, Characteristic.CurrentHeaterCoolerState.HEATING);
			this.airconService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(Characteristic.CurrentHeaterCoolerState.HEATING);
			this.storage.setItemSync("http-webhook-target-heater-cooler-state-" + this.id, Characteristic.TargetHeaterCoolerState.HEAT);
			this.airconService.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(Characteristic.TargetHeaterCoolerState.HEAT);
			Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.heatingThresholdTemperatureSignal[temp - this.tempMin]), "", this.remoHeader, false, callback, context);
		} else {
			this.log("[Aircon][%s][Cool Mode]...", this.name);
			this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, Characteristic.CurrentHeaterCoolerState.COOLING);
			this.airconService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(Characteristic.CurrentHeaterCoolerState.COOLING);
			this.storage.setItemSync("http-webhook-target-heater-cooler-state-" + this.id, Characteristic.TargetHeaterCoolerState.COOL);
			this.airconService.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(Characteristic.TargetHeaterCoolerState.COOL);
			Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.coolingThresholdTemperatureSignal[temp - this.tempMin]), "", this.remoHeader, false, callback, context);
		}
	} else if (!active && cachedActive) {
		this.log("[Aircon][%s] Setting to 'OFF'...", this.name);
		this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, Characteristic.CurrentHeaterCoolerState.INACTIVE);
		this.airconService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(Characteristic.CurrentHeaterCoolerState.INACTIVE);
		if (this.functions.includes("blow")) {
			this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.INACTIVE);
			this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
			this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.INACTIVE);
			this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.INACTIVE);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, 0);
		}
		Util.callHttpApi(this.log, this.remoURL, "POST", this.setActiveSignal, "", this.remoHeader, false, callback, context);
	} else {
		callback(null);		
	}
};

HttpWebHookRemoAirconAccessory.prototype.getCurrentHeaterCoolerState = function(callback) {
	this.log.debug("[Aircon][%s] airconService getCurrentHeaterCoolerState...", this.name);
	var state = this.storage.getItemSync("http-webhook-current-heater-cooler-state-" + this.id);
	if (state === undefined) {
		state = Characteristic.CurrentHeaterCoolerState.INACTIVE;
	}
	callback(null, state);
};

HttpWebHookRemoAirconAccessory.prototype.getTargetHeaterCoolerState = function(callback) {
	this.log.debug("[Aircon][%s] airconService getTargetHeaterCoolerState...", this.name);
	var state = this.storage.getItemSync("http-webhook-current-heater-cooler-state-" + this.id);
	if (state === undefined) {
		state = Characteristic.TargetHeaterCoolerState.AUTO;
	}
	callback(null, state);
};

HttpWebHookRemoAirconAccessory.prototype.setTargetHeaterCoolerState = function(state, callback, context) {
	this.log.debug("[Aircon][%s] airconService setTargetHeaterCoolerState to '%d'...", this.name, state);
	var cachedState = this.storage.getItemSync("http-webhook-target-heater-cooler-state-" + this.id);
	this.storage.setItemSync("http-webhook-target-heater-cooler-state-" + this.id, state);
	var temp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
	if (state == Characteristic.TargetHeaterCoolerState.AUTO) {
		var currentTemp = this.storage.getItemSync("http-webhook-" + this.currentTemperature);
		if (this.functions.includes("warm") && currentTemp < temp) {
			state = Characteristic.TargetHeaterCoolerState.HEAT;
		} else {
			state = Characteristic.TargetHeaterCoolerState.COOL;
		}
		this.airconService.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(state, callback, context);
	} else if (state != cachedState) {
		if (this.functions.includes("blow")) {
			var fanActive = this.storage.getItemSync("http-webhook-active-" + this.id);
			if (!fanActive) {
				this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.ACTIVE);
				this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
				this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
				this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
			}
			this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, Characteristic.TargetFanState.AUTO);
			this.fanService.getCharacteristic(Characteristic.TargetFanState).updateValue(Characteristic.TargetFanState.AUTO);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, 50);
			this.fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(50);
		}
		var dehumidifierActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-dehumidifier");
		if (this.functions.includes("dry") && dehumidifierActive) {
			this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
			this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
			this.storage.setItemSync("http-webhook-active-" + this.id + "-dehumidifier", Characteristic.Active.INACTIVE);
			this.dehumidifierService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
		}
		var temp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
		cachedState = this.storage.getItemSync("http-webhook-current-heater-cooler-state-" + this.id) - 1;
		if (cachedState != state) {
			this.log("[Aircon][%s] Setting target temperature to '%d'...", this.name, temp);
			this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, state + 1);
			this.airconService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(state + 1);
			if (state == Characteristic.TargetHeaterCoolerState.COOL) {
				this.log("[Aircon][%s][Cool Mode]...", this.name);
				Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.coolingThresholdTemperatureSignal[temp - this.tempMin]), "", this.remoHeader, false, callback, context);
			} else {
				this.log("[Aircon][%s][Heat Mode]...", this.name);
				Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.heatingThresholdTemperatureSignal[temp - this.tempMin]), "", this.remoHeader, false, callback, context);
			}
		}
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getCurrentTemperature = function(callback) {
	this.log.debug("[Aircon][%s] airconService getCurrentTemperature...", this.name);
	var temp = this.storage.getItemSync("http-webhook-" + this.currentTemperature);
	if (temp === undefined) {
		temp = 26.0;
	}
	this.airconService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(temp);
	callback(null, temp);
};

HttpWebHookRemoAirconAccessory.prototype.getCoolingThresholdTemperature = function(callback) {
	this.log.debug("[Aircon][%s] airconService getCoolingThresholdTemperature...", this.name);
	var temp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
	if (temp === undefined) {
		temp = 20;
	}
	callback(null, temp);
};

HttpWebHookRemoAirconAccessory.prototype.setCoolingThresholdTemperature = function(temp, callback, context) {
	this.log.debug("[Aircon][%s] airconService setCoolingThresholdTemperature to '%d'...", this.name, temp);
	var cachedTemp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
	this.storage.setItemSync("http-webhook-target-temperature-" + this.id, temp);
	if (temp != cachedTemp) {
		this.log("[Aircon][%s] Setting target temperature to '%d'...", this.name, temp);
		this.log("[Aircon][%s][Cool Mode]...", this.name);
		Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.coolingThresholdTemperatureSignal[temp - this.tempMin]), "", this.remoHeader, false, callback, context);
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getHeatingThresholdTemperature = function(callback) {
	this.log.debug("[Aircon][%s] airconService getHeatingThresholdTemperature...", this.name);
	var temp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
	if (temp === undefined) {
		temp = 20;
	}
	callback(null, temp);
};

HttpWebHookRemoAirconAccessory.prototype.setHeatingThresholdTemperature = function(temp, callback, context) {
	this.log.debug("[Aircon][%s] airconService setHeatingThresholdTemperature to '%d'...", this.name, temp);
	var cachedTemp = this.storage.getItemSync("http-webhook-target-temperature-" + this.id);
	this.storage.setItemSync("http-webhook-target-temperature-" + this.id, temp);
	if (temp != cachedTemp) {
		this.log("[Aircon][%s] Setting target temperature to '%d'...", this.name, temp);
		this.log("[Aircon][%s][Heat Mode]...", this.name);
		Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.heatingThresholdTemperatureSignal[temp - this.tempMin]), "", this.remoHeader, false, callback, context);
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getDehumidifierActive = function(callback) {
	this.log.debug("[Aircon][%s] dehumidifierService getActive...", this.name);
	var active = this.storage.getItemSync("http-webhook-active-" + this.id + "-dehumidifier");
	if (active === undefined) {
		active = Characteristic.Active.INACTIVE;
	}
	callback(null, active);
};

HttpWebHookRemoAirconAccessory.prototype.setDehumidifierActive = function(active, callback, context) {
	this.log.debug("[Debug][%s][dehumidifierService] setActive to '%s'...", this.name, Boolean(active));
	var cachedActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-dehumidifier");
	this.storage.setItemSync("http-webhook-active-" + this.id + "-dehumidifier", parseInt(active));
	
	if (active && !cachedActive) {
		this.log.debug("[Debug][%s][dehumidifierService] OFF to ON...", this.name, Boolean(active));
		if (this.functions.includes("blow")){
			var fanActive = this.storage.getItemSync("http-webhook-active-" + this.id);
			if (!fanActive) {
				this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.ACTIVE);
				this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
				this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
				this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
			}
			this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, Characteristic.TargetFanState.AUTO);
			this.fanService.getCharacteristic(Characteristic.TargetFanState).updateValue(Characteristic.TargetFanState.AUTO);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, Math.round(100 / this.fanRotationSpeedSignal.length));
			this.fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(Math.round(100 / this.fanRotationSpeedSignal.length));
		}
		this.setActive("dehumidifier");
		this.log("[Aircon][%s][Dry Mode]...", this.name);
		this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
		this.storage.setItemSync("http-webhook-target-humidifier-dehumidifier-state-" + this.id, Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);
		this.dehumidifierService.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState).updateValue(Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);
		Util.callHttpApi(this.log, this.remoURL, "POST", this.setTargetHumidifierDehumidifierStateSignal, "", this.remoHeader, false, callback, context);
	} else if (!active && cachedActive) {
		this.log("[Aircon][%s] Setting to 'OFF'...", this.name);
		this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
		if (this.functions.includes("blow")) {
			this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.INACTIVE);
			this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
			this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.INACTIVE);
			this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.INACTIVE);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, 0);
		}
		Util.callHttpApi(this.log, this.remoURL, "POST", this.setActiveSignal, "", this.remoHeader, false, callback, context);
	} else {
		callback(null);		
	}
};

HttpWebHookRemoAirconAccessory.prototype.getCurrentHumidifierDehumidifierState = function(callback) {
	this.log.debug("[Debug][%s][dehumidifierService] getCurrentHumidifierDehumidifierState...", this.name);
	var state = this.storage.getItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id);
	if (state === undefined) {
		state = Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
	}
	callback(null, state);
};

HttpWebHookRemoAirconAccessory.prototype.getTargetHumidifierDehumidifierState = function(callback) {
	this.log.debug("[Debug][%s][dehumidifierService] getTargetHumidifierDehumidifierState...", this.name);
	var state = this.storage.getItemSync("http-webhook-target-humidifier-dehumidifier-state-" + this.id);
	if (state === undefined) {
		state = Characteristic.TargetHumidifierDehumidifierState.AUTO;
	}
	callback(null, state);
};

HttpWebHookRemoAirconAccessory.prototype.setTargetHumidifierDehumidifierState = function(state, callback, context) {
	this.log.debug("[Debug][%s][dehumidifierService] setTargetHumidifierDehumidifierState to '%d'...", this.name, state);
	var cachedState = this.storage.getItemSync("http-webhook-target-humidifier-dehumidifier-state-" + this.id);
	this.storage.setItemSync("http-webhook-target-humidifier-dehumidifier-state-" + this.id, state);
	if (state == Characteristic.TargetHumidifierDehumidifierState.AUTO) {
		this.log.debug("[Debug][%s][dehumidifierService] AUTO to DEHUMIDIFIER...", this.name);
		state = Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
		this.dehumidifierService.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState).updateValue(state, callback, context);
	} else if (cachedState != state) {
		this.log.debug("[Debug][%s][dehumidifierService] DEHUMIDIFIER...", this.name);
		if (this.functions.includes("blow")){
			var fanActive = this.storage.getItemSync("http-webhook-active-" + this.id);
			if (!fanActive) {
				this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.ACTIVE);
				this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
				this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
				this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
			}
			this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, Characteristic.TargetFanState.AUTO);
			this.fanService.getCharacteristic(Characteristic.TargetFanState).updateValue(Characteristic.TargetFanState.AUTO);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, Math.round(100 / this.fanRotationSpeedSignal.length));
			this.fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(Math.round(100 / this.fanRotationSpeedSignal.length));
		}
		this.setActive("dehumidifier");
		this.log("[Aircon][%s][Dry Mode]...", this.name);
		this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
		Util.callHttpApi(this.log, this.remoURL, "POST", this.setTargetHumidifierDehumidifierStateSignal, "", this.remoHeader, false, callback, context);
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getCurrentRelativeHumidity = function(callback) {
	this.log.debug("[Debug][%s][dehumidifierService] getCurrentRelativeHumidity...", this.name);
	var humd = this.storage.getItemSync("http-webhook-" + this.currentHumidity);
	if (humd === undefined) {
		humd = 50;
	}
	this.dehumidifierService.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(humd);
	callback(null, humd);
};

HttpWebHookRemoAirconAccessory.prototype.getActive = function(callback) {
	this.log.debug("[Debug][%s][fanService] getActive...", this.name);
	var active = this.storage.getItemSync("http-webhook-active-" + this.id);
	if (active === undefined) {
		active = Characteristic.Active.INACTIVE;
	}
	callback(null, active);
};

HttpWebHookRemoAirconAccessory.prototype.setFanActive = function(active, callback, context) {
	this.log.debug("[Debug][%s][fanService] setActive to '%s'...", this.name, Boolean(active));
	this.storage.setItemSync("http-webhook-active-" + this.id, parseInt(active));
	var state = this.storage.getItemSync("http-webhook-current-fan-state-" + this.id);
	if (!state && active) {
		this.log("[Aircon][%s][Fan Mode]...", this.name);
		this.log("[Aircon][%s][Fan Mode] Setting Rotation Speed to '100'...", this.name);
		this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
		this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
		this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, Characteristic.TargetFanState.MANUAL);
		this.fanService.getCharacteristic(Characteristic.TargetFanState).updateValue(Characteristic.TargetFanState.MANUAL);
		var speed =  Math.round(100 / this.fanRotationSpeedSignal.length));
		this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, speed);
		this.fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(speed);
		var rotationSpeed = Math.round(Math.max(speed, 1) * this.blowStep);
		this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, rotationSpeed);
		Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.fanRotationSpeedSignal[speed - 1]), "", this.remoHeader, false, callback, context);
	} else if (state && !active) {
		this.log("[Aircon][%s] Setting to 'OFF'...", this.name);
		this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.INACTIVE);
		this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.INACTIVE);
		this.setActive("fan");
		Util.callHttpApi(this.log, this.remoURL, "POST", this.setActiveSignal, "", this.remoHeader, false, callback, context);
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getCurrentFanState = function(callback) {
	this.log.debug("[Debug][%s][fanService] getCurrentFanState...", this.name);
	var state = this.storage.getItemSync("http-webhook-current-fan-state-" + this.id);
	if (state === undefined) {
		state = Characteristic.CurrentFanState.INACTIVE;
	}
	callback(null, state);
};

HttpWebHookRemoAirconAccessory.prototype.getTargetFanState = function(callback) {
	this.log.debug("[Debug][%s][fanService] getTargetFanState...", this.name);
	var state = this.storage.getItemSync("http-webhook-target-fan-state-" + this.id);
	if (state === undefined) {
		state = Characteristic.TargetFanState.AUTO;
	}
	callback(null, state);
};

HttpWebHookRemoAirconAccessory.prototype.setTargetFanState = function(state, callback, context) {
	this.log.debug("[Debug][%s][fanService] setTargetFanState to '%d'...", this.name, state);
	var cachedState = this.storage.getItemSync("http-webhook-target-fan-state-" + this.id);
	this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, state);
	if (state != cachedState) {
		var speed = this.storage.getItemSync("http-webhook-rotation-speed-" + this.id);
		this.log.debug("[Debug][%s][fanService] AUTO / MANUAL...", this.name, state);
		if (state) {
			speed = 50;
		}
		this.log("[Aircon][%s][Fan Mode]...", this.name);
		this.log("[Aircon][%s][Fan Mode] Setting Rotation Speed to '%d'...", this.name, speed);
		this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.ACTIVE);
		this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
		this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
		this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
		speed =  Math.round(speed / this.blowStep);
		var rotationSpeed = Math.round(Math.max(speed, 1) * this.blowStep);
		this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, rotationSpeed);
		Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.fanRotationSpeedSignal[speed - 1]), "", this.remoHeader, false, callback, context);
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getFanRotationSpeed = function(callback) {
	this.log.debug("[Debug][%s][fanService] getFanRotationSpeed...", this.name);
	var speed = this.storage.getItemSync("http-webhook-rotation-speed-" + this.id);
	if (speed === undefined) {
		speed = 0;
	}
	callback(null, speed);
};

HttpWebHookRemoAirconAccessory.prototype.setFanRotationSpeed = function(speed, callback, context) {
	this.log.debug("[Debug][%s][fanService] setFanRotationSpeed to '%d'...", this.name, speed);
	var cachedSpeed = this.storage.getItemSync("http-webhook-rotation-speed-" + this.id);
	this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, speed);
	this.setActive("fan");
	if (speed != cachedSpeed) {
		this.log.debug("[Debug][%s][fanService] ON / OFF", this.name);
		if (speed) {
			this.log("[Aircon][%s][Fan Mode]...", this.name);
			this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.ACTIVE);
			this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
			this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.BLOWING_AIR);
			this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.BLOWING_AIR);
			this.storage.setItemSync("http-webhook-target-fan-state-" + this.id, Characteristic.TargetFanState.MANUAL);
			this.fanService.getCharacteristic(Characteristic.TargetFanState).updateValue(Characteristic.TargetFanState.MANUAL);
			speed =  Math.round(speed / this.blowStep);
			var rotationSpeed = Math.round(Math.max(speed, 1) * this.blowStep);
			this.log("[Aircon][%s][Fan Mode] Setting Rotation Speed to '%d'...", this.name, rotationSpeed);
			this.storage.setItemSync("http-webhook-rotation-speed-" + this.id, rotationSpeed);
			Util.callHttpApi(this.log, this.remoURL, "POST", JSON.stringify(this.fanRotationSpeedSignal[speed - 1]), "", this.remoHeader, false, callback, context);
		} else {
			this.log("[Aircon][%s] Setting to 'OFF'...", this.name);
			this.storage.setItemSync("http-webhook-active-" + this.id, Characteristic.Active.INACTIVE);
			this.fanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
			this.storage.setItemSync("http-webhook-current-fan-state-" + this.id, Characteristic.CurrentFanState.INACTIVE);
			this.fanService.getCharacteristic(Characteristic.CurrentFanState).updateValue(Characteristic.CurrentFanState.INACTIVE);
			Util.callHttpApi(this.log, this.remoURL, "POST", this.setActiveSignal, "", this.remoHeader, false, callback, context);
		}
	} else {
		callback(null);
	}
};

HttpWebHookRemoAirconAccessory.prototype.setActive = function(service) {
	var airconActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-aircon");
	if (service != "aircon" && airconActive) {
		this.storage.setItemSync("http-webhook-active-" + this.id + "-aircon", Characteristic.Active.INACTIVE);
		this.airconService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
		this.storage.setItemSync("http-webhook-current-heater-cooler-state-" + this.id, Characteristic.CurrentHeaterCoolerState.INACTIVE);
		this.airconService.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(Characteristic.CurrentHeaterCoolerState.INACTIVE);
	}
	var dehumidifierActive = this.storage.getItemSync("http-webhook-active-" + this.id + "-dehumidifier");
	if (service != "dehumidifier" && dehumidifierActive) {
		this.storage.setItemSync("http-webhook-active-" + this.id + "-dehumidifier", Characteristic.Active.INACTIVE);
		this.dehumidifierService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
		this.storage.setItemSync("http-webhook-current-humidifier-dehumidifier-state-" + this.id, Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
		this.dehumidifierService.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState).updateValue(Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
	}
};

HttpWebHookRemoAirconAccessory.prototype.getServices = function() {
	return this.services;
};

module.exports = HttpWebHookRemoAirconAccessory;