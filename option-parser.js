(function () {
    "use strict";

    var OptionType = {
			normal: function (opt) {
				var s = "   ";

				if (opt.shortCode) {
					s += "-" + opt.shortCode + ", ";
				}

				if (opt.longCode) {
					s += "--" + opt.longCode;
				}

				if (opt.valueIsRequired()) {
					s += "[=]";
				}

				s += ": ";

				if (opt.description) {
					s += opt.description;
				}

				if (opt.hasDefaultValue()) {
					s += " [default: " + opt.value['default'] + "]";
				}

				s += "\n";

				return s;
			},
			help: function (opt) {
				return OptionType.normal(opt);
			},
			separator: function (opt) {
				var s = "";
				if (opt.description) {
					if (opt.description.startsWith("--")) {
						s += "\n" + "-".repeat(80);
					} else if (opt.description.startsWith(" --")) {
						s += "\n   " + "-".repeat(77);
					}
				}
				return s + "\n".repeat(opt.data.length || 1);
			},
			note: function (opt) {
				if (opt.description) {
					return "   NOTE: " + opt.description + ")\n";
				}
				return "";
			},
			footer: function (opt) {
				if (opt.description) {
					return opt.description + "\n";
				}
				return "";
			}
		};


	if (typeof String.prototype.startsWith !== "function") {
		String.prototype.startsWith = function (str) {
			return this.lastIndexOf(str, 0) === 0;
		};
	}

	if (typeof String.prototype.startsWithICase !== "function") {
		String.prototype.startsWithICase = function (str) {
			return this.toLowerCase().startsWith(str.toLowerCase());
		};
	}
	if (typeof String.prototype.repeat !== "function") {
		String.prototype.repeat = function(count) {
			if (count < 1) {
				return "";
			}

			var result = "", pattern = this.valueOf();

			while (count > 0) {
				if (count & 1) {
					result += pattern;
				}
				count >>= 1, pattern += pattern;
			}

			return result;
		};
	}
	if (typeof String.prototype.toCamelCase !== "function") {
		String.prototype.toCamelCase = function () {
			return this.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase() });
		};
	}

	function OptionParser(args, scriptName, options) {
		this.args = args || [];
		this.scriptName = scriptName || this.args[0] || "";
		this.types = Object.keys(OptionType);
		this.options = options || [];
	}

	/**
	 * creates a new OptionParser object
	 * @param  {string} scriptName used in the banner
	 * @param  {array} options array of Option
	 * @return {OptionParser}
	 */
	OptionParser.create = function (scriptName, options) {
		return new OptionParser(scriptName, options);
	};

	/**
	 * creates a new Option object
	 * @param  {object} optionParams params to override on the Option object
	 * @return {Option}
	 */
	OptionParser.createOption = function (optionParams) {
		var option = new Option(optionParams);
		return option;
	};

	/**
	 * creates a simple error object
	 * @param  {string} msg
	 * @param  {number} code
	 * @return {object}
	 */
	OptionParser.generateError = function (msg, code) {
		return {
			msg: msg || "",
			code: code || -1
		};
	};

	/**
	 * adds an option to the options array if it doesn"t exist
	 * @param  {Option} option adds the option object to the options array if id does not exist
	 * @return {OptionParser} self allows for chaining
	 */
	OptionParser.prototype.addOption = function (optionParams) {
		var self = this,
			option, found;

		if (optionParams.forEach) {
			optionParams.forEach(function (op) {
				option = OptionParser.createOption(op);
				found = self.findOption(option.getId());
				if (!found) {
					self.options.push(option);
				}
			});
		} else {
			option = OptionParser.createOption(optionParams);
			found = self.findOption(option.getId());
			if (!found) {
				self.options.push(option);
			}
		}

		return self;
	};

	/**
	 * attempts to find an option in the options array by id
	 * @param  {string} id or longCode or ShortCode
	 * @return {Option} null if not found
	 */
	OptionParser.prototype.findOption = function (id) {
		var self = this, i;

		for (i = 0; i < self.options.length; i += 1) {
			if (
                self.options[i].getId() === id ||
                self.options[i].longCode === id ||
                self.options[i].shortCode === id
            ) {
				return self.options[i];
			}
		}

		return null;
	};

	OptionParser.prototype.getBanner = function () {
		var self = this,
			s;

		s = "\nUsage: " + self.scriptName + " [options]\n" +
				"\nOptions (case-sensitive):\n\n";

		self.options.forEach(function (opt) {
			opt.type = opt.type || OptionType.normal;

			s += opt.type(opt);
		});

		return s;
	};

	OptionParser.prototype.parse = function (callback) {
		var self = this,
			i, arg, argCode, index, opt, nextArg, msg;

		// skip the first arg
		for (i = 1; i < self.args.length; i += 1) {
			arg = self.args[i];

			if (arg.startsWith("--")) {
				argCode = arg.slice(2).toLowerCase(); // strip the switch and lcase
			} else if (arg.startsWith("-")) {
				argCode = arg.slice(1); // strip the switch
			}

			// remove from code, if value passed as "="
			index = argCode.indexOf("=");
			if (index >= 1) {
				argCode = argCode.slice(0, index);
			}

			// compare the args to the options array
			opt = self.findOption(argCode);
			if (opt) {
				if (opt.type === OptionType.help) {
					callback(true, null);
				}

				// grab the next arg, if any, for comparison
				nextArg = self.args[(i + 1)];

				if (arg.indexOf("=") >= 1) {
					opt.value.current = arg.split("=")[1];
				} else if ( !nextArg || (nextArg && nextArg.startsWith("-")) ) {
					// the switch was provided but not a requisite value
					if (opt.valueIsRequired() && !opt.getValue()) {
						callback(OptionParser.generateError(argCode + " requires a value"), null);
					}

					opt.value.current = true;
				} else {
					i += 1;
					opt.value.current = nextArg;
				}
			} else {
				callback(OptionParser.generateError(argCode + " not found in options"), null);
			}
		}

		// process required switches
		self.options.forEach(function (option, i) {
            var found;
            
			if (option.required && typeof option.required === "string") {
				found = self.findOption(option.required);
				if (found && (!option.getValue() && !found.getValue())) {
					msg = option.getCode() + " -OR- " + found.getCode() + " is required";
					callback(OptionParser.generateError(msg), null);
				}
			} else if (option.required && !option.getValue()) {
				callback(OptionParser.generateError(option.getCode() + " is required"), null);
			}
		});

		callback(null, self.options);
	};

	function Option(opt) {
		var self = this,
			keys, filtered;

		opt = opt || {};

		self.longCode = opt.longCode || opt.lCode || null;
		self.shortCode = opt.shortCode || opt.sCode || null;
		self.description = opt.description || opt.desc || null;
		self.type = opt.type || OptionType.normal;
		self.value = {
			current: (opt.value && opt.value.current) || null,
			"default": (opt.value && opt.value["default"]) || null,
			required: (opt.value && opt.value.required) || false
		};
		self.required = opt.required || false;
		self.data = opt.data || {};
		self.id = opt.id || self.longCode || self.shortCode || null;

		// push any excess into the data object
		keys = Object.keys(self);
		filtered = Object.keys(opt).filter(function (item) {
			return (keys.indexOf(item) < 0);
		});

		filtered.forEach(function (key) {
			if (opt[key]) {
				self.data[key] = opt[key];
			}
		});
	}

	Option.prototype.getCode = function () {
		return this.longCode || this.shortCode || null;
	};

	Option.prototype.getValue = function () {
		return this.value.current;
	};

	Option.prototype.hasDefaultValue = function () {
		return this.value["default"];
	};

	Option.prototype.valueIsRequired = function () {
		return this.value.required;
	};

	Option.prototype.hasData = function () {
		return (this.data.length && this.data.length > 0);
	};

	Option.prototype.getId = function () {
		var id = this.id || this.longCode || this.shortCode || null;

		// convert id to camelCase
		if (id) {
			return id.toCamelCase();
		}

		return this.id;
	};

	if (module.exports) {
		module.exports = {
			create: OptionParser.create,
			OptionType: OptionType
		};
	}
})();