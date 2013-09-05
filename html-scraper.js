/**
 * Module to generate an image from either a URL or HTML string
 */
(function (phantom) {
    'use strict';

    var WebPage = require('webpage'),
		system = require('system'),
		fs = require('fs'),
		page = WebPage.create(),
		OptionParser = require('./option-parser'),
		parser = OptionParser.create(system.args);

	if (typeof String.prototype.startsWith !== 'function') {
		String.prototype.startsWith = function (str) {
			return this.lastIndexOf(str, 0) === 0;
		};
	}

	if (typeof String.prototype.startsWithICase !== 'function') {
		String.prototype.startsWithICase = function (str) {
			return this.toLowerCase().startsWith(str.toLowerCase());
		};
	}

	page.raiseError = function (msg, exitCode) {
		exitCode = exitCode || 1;
		system.stderr.write('Error(' + exitCode +  '): ' + msg);
		phantom.exit(exitCode);
	};

	page.raiseWarning = function (msg, exitCode) {
		if (exitCode) {
			system.stderr.write(msg);
			phantom.exit(exitCode);
		} else {
			system.stdout.write(msg);
		}
	};

	page.raiseMessage = function (msg) {
		if (page.config.debug) {
			if (typeof msg === 'function') {
				msg();
			} else {
				system.stdout.write(msg);
			}
		}
	};

	/**
	 * wait until the test condition is true or a timeout occurs
	 *
	 * @param  {function} testFx javascript condition that evaluates to a boolean
	 * @param  {function} onReady what to do when testFx condition is fulfilled
	 * @param  {number} timeOutMillis the max amount of time to wait, in ms
	 */
	page.waitFor = function (testFx, onReady, timeOutMillis) {
		var maxtimeOutMillis = timeOutMillis || 3000,
			start = new Date().getTime(),
			condition = false,
			interval = setInterval(function () {
				if ( (new Date().getTime() - start < maxtimeOutMillis) && !condition ) {
					// not time-out yet and condition not yet fulfilled
					condition = testFx();
				} else {
					if(!condition) {
						// condition still not fulfilled (timeout but condition is 'false')
						page.raiseError("'waitFor()' timeout");
					} else {
						// condition fulfilled (timeout and/or condition is 'true')
						page.raiseMessage("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
						onReady(); // do what it's supposed to do once the condition is fulfilled
						clearInterval(interval); // stop this interval
					}
				}
			}, page.config.waitforInterval || 250); // repeat check
	};

	/**
	 * quick and dirty HTML validator
	 * @param  {string} html
	 * @return {boolean} valid or not
	 */
	page.isValidHtml = function (html) {
		var valid, doc;

		// if no html arg provided, check page.config
		if (!html && page.config.html) {
			html = page.config.html;
		}

		doc = document.createElement('div');
		doc.innerHTML = html;
		valid = (doc.innerHTML === html);

		return valid;
	};

	/**
	 * injects the HTML string into the page
	 * @param  {string} html
	 */
	page.injectHtml = function (html) {
		// if no html arg provided, check page.config
		if (!html && page.config.html) {
			html = page.config.html;
		}

		html = html.replace('\\r', '\r').replace('\\n', '\n');

		// allow complete html element replacement
		if (
			!html.startsWithICase('<!doctype') &&
			!html.startsWithICase('<html') &&
			!page.isValidHtml(html)
		) {
			page.raiseError('Provided HTML string is invalid!');
		}

		page.content = html;
	};

	/**
	 * injects and renders an HTML string
	 * @param  {string} html
	 */
	page.renderHtml = function (html) {
		// if no html arg provided, check page.config
		if (!html && page.config.html) {
			html = page.config.html;
		}

		// inject the HTML string and render
		page.injectHtml(page.config.html);
		if (page.config.output) {
			page.render(page.config.output);
		} else {
			page.outputBase64Image();
		}
	};

	page.outputBase64Image = function (buffer) {
		var base64Image;

		buffer = buffer || system.stdout;

		base64Image = page.renderBase64(page.config.outputBase64Format);
		buffer.write(base64Image);
	};

	//
	// handle the appropriate page events
	//
	page.onLoadStarted = function () {
		page.startTime = new Date();
	};

	/**
	 * the page is loaded
	 * @param  {string} status
	 */
	page.onLoadFinished = function (status) {
		if (status !== 'success') {
			page.raiseError('Unable to load: ' + page.config.url);
		}

		page.endTime = new Date();
		page.title = page.evaluate(function () {
			return document.title;
		});

		page.waitFor(function () {
			var i;

			// verify all page resources have loaded, except first as undefined
			for (i = 1; i < page.resources.length; i += 1) {
				var resource = page.resources[i],
					request = resource.request,
					endReply = resource.endReply;

				if (!request || !endReply || endReply.stage !== 'end') {
					return false;
				}
			}

			return true;
		}, function () {
			if (page.config.output) {
				page.render(page.config.output);
			} else {
				page.outputBase64Image();
			}
			phantom.exit();
		}, page.config.waitforTimeout || 3000);
	};

	/**
	 * setup resource ref
	 * @param  {object} req
	 */
	page.onResourceRequested = function (req) {
		page.raiseMessage('Request ' + JSON.stringify(req, undefined, 4) + '\n');
		
		page.resources[req.id] = {
			request: req,
			startReply: null,
			endReply: null
		};
	};

	/**
	 * update resource status, based on stage
	 * @param  {object} res
	 */
	page.onResourceReceived = function (res) {
		page.raiseMessage('Response ' + JSON.stringify(res, undefined, 4) + '\n');
		
		if (res.stage === 'start') {
			page.resources[res.id].startReply = res;
		} else if (res.stage === 'end') {
			page.resources[res.id].endReply = res;
		}
	};

	/**
	 * captures console messages outputted to the screen
	 * @param  {string} msg
	 * @param  {number} lineNum
	 * @param  {string} sourceId 
	 */
	page.onConsoleMessage = function (msg, lineNum, sourceId) {
		var s = 'CONSOLE: ' + msg;

		if (lineNum) {
			s += ' (from line #' + lineNum;
		}
		
		if (sourceId) {
			s += ' in "' + sourceId;
		}

		if (lineNum || sourceId) {
			s += '")';
		}

		page.raiseMessage(s);
	};

	/**
	 * captures all javascript errors thrown in the page
	 * @param  {string} msg
	 * @param  {array} trace
	 */
	page.onError = function (msg, trace) {
		var msgStack = ['ERROR: ' + msg];

		if (trace && trace.length) {
			msgStack.push('TRACE:');
			trace.forEach(function (t) {
				msgStack.push(' -> ' + t.file + ': ' + t.line +
					(t.function ? ' (in function "' + t.function + '")' : ''));
			});
		}

		page.raiseError(msgStack.join('\n'));
	};

	parser.addOption([
		{
			longCode: 'url',
			shortCode: 'u',
			description: 'a URL to load',
			value: { required: true },
			required: 'html'
		},
		{
			longCode: 'html',
			shortCode: 'h',
			description: 'string of HTML to be loaded (HTML must be valid-ish)',
			value: { required: true },
			required: 'url'
		},
		{
			id: 'note1',
			type: OptionParser.OptionType.note,
			description: 'If both url and html are provided url takes precedence'
		},
		{
			longCode: 'output',
			shortCode: 'o',
			description: 'the local path of the file to save',
			value: { required: true },
			required: 'output-base64'
		},
		{
			longCode: 'output-base64',
			shortCode: 'O',
			description: 'output page image as base64 encoded string',
			value: { 'default': false },
			required: 'output'
		},
		{
			id: 'note2',
			type: OptionParser.OptionType.note,
			description: 'If both output and output-base64 are provided output takes precedence'
		},
		{
			longCode: 'output-base64-format',
			shortCode: 'OF',
			description: 'output page image base64 format',
			value: { required: true, 'default': 'PNG' }
		},
		{
			id: 'sep1',
			type: OptionParser.OptionType.separator,
			description: ' --'
		},
		{
			longCode: 'width',
			shortCode: 'W',
			description: 'width of the page viewport',
			value: { required: true }
		},
		{
			longCode: 'height',
			shortCode: 'H',
			description: 'height of the page viewport',
			value: { required: true }
		},
		{
			longCode: 'scale',
			shortCode: 'S',
			description: 'zoomFactor of the page',
			value: { required: true, 'default': 1.0 }
		},
		{
			id: 'sep2',
			type: OptionParser.OptionType.separator,
			description: ' --'
		},
		{
			longCode: 'waitfor-interval',
			shortCode: 'wfi',
			description: 'time (in ms) to run waitFor',
			value: { required: true, 'default': 150 }
		},
		{
			longCode: 'waitfor-timeout',
			shortCode: 'wft',
			description: 'maximum wait time (in ms) for waitFor to run',
			value: { required: true, 'default': 5000 }
		},
		{
			id: 'sep3',
			type: OptionParser.OptionType.separator,
			description: ' --'
		},
		{
			longCode: 'disable-javascript',
			description: 'disable page settings javascriptEnabled',
			value: { required: true }
		},
		{
			longCode: 'disable-load-images',
			description: 'disable page settings loadImages',
			value: { required: true }
		},
		{
			longCode: 'enable-local-to-remote-url-access',
			description: 'enable page settings localToRemoteUrlAccessEnabled',
			value: { 'default': true }
		},
		{
			longCode: 'user-agent',
			description: 'set the page settings userAgent',
			value: { required: true }
		},
		{
			longCode: 'username',
			description: 'set the page settings userName',
			value: { required: true }
		},
		{
			longCode: 'password',
			description: 'set the page settings password',
			value: { required: true }
		},
		{
			longCode: 'enable-xss-auditing',
			description: 'enable page settings XSSAuditingEnabled',
			value: { 'default': true }
		},
		{
			longCode: 'disable-web-security',
			description: 'disables page settings webSecurityEnabled',
			value: { 'default': true }
		},
		{
			id: 'sep4',
			type: OptionParser.OptionType.separator,
			description: ' --',
			length: 1
		},
		{
			longCode: 'debug',
			shortCode: null,
			description: 'prints more verbose output',
			value: { 'default': false }
		},
		{
			type: OptionParser.OptionType.help,
			longCode: 'help',
			shortCode: null,
			description: 'displays this usage message'
		},
		{
			id: 'footer1',
			type: OptionParser.OptionType.footer,
			description: ''
		},
	]);

	parser.parse(function (err, options) {
		if (err) {
			var msg = parser.getBanner();
			if (err.msg) {
				msg += '\nError: ' + err.msg;
			}
			page.raiseWarning(msg, 1);
		}

		page.config = {};
		page.resources = [];
		
		// strip out unnecessary portions of Option array
		options.forEach(function (opt, i) {
			page.config[opt.getId()] = opt.getValue();
		});

		if (page.config.width && page.config.height) {
			page.viewportSize = { width: page.config.width, height: page.config.height };
		}

		if (page.config.scale) {
			page.zoomFactor = page.config.scale;
		}

		// configure page settings, if provided
		if (page.config.disableJavascript) {
			page.settings.javascriptEnabled = false;
		}

		if (page.config.disableLoadImages) {
			page.settings.loadImages = false;
		}

		if (page.config.enableLocalToRemoteUrlAccess) {
			page.settings.localToRemoteUrlAccessEnabled = true;
		}

		if (page.config.userAgent) {
			page.settings.userAgent = page.config.userAgent;
		}

		if (page.config.userName) {
			page.settings.userName = page.config.userName;
		}

		if (page.config.password) {
			page.settings.password = page.config.password;
		}

		if (page.config.enableXssAuditing) {
			page.settings.XSSAuditingEnabled = true;
		}

		if (page.config.disableWebSecurity) {
			page.settings.webSecurityEnabled = false;
		}

		page.raiseMessage(function () {
			for (var setting in page.settings) {
				page.raiseMessage(setting + ': ' + page.settings[setting] + '\n');
			}
		});

		// process the request
		if (page.config.url) {
			// if it's a local file open through fs and inject
			if (page.config.url.startsWithICase('file:///')) {
				page.config.url = page.config.url.slice(8); // strip the protocol text
				if (fs.isReadable(page.config.url)) {
					page.config.html = fs.read(page.config.url);
					page.renderHtml(page.config.html);
				} else {
					page.open(page.config.url);
				}
			} else {
				page.open(page.config.url);
			}
		} else {
			page.renderHtml(page.config.html);
		}
	});
})(phantom);