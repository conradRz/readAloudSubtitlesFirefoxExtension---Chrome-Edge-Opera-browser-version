var config = {
    serviceUrl: "https://support.readaloud.app",
    webAppUrl: "https://readaloud.app",
    entityMap: {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    },
    langMap: {
        iw: 'he'
    }
}

var defaults = {
    rate: 1.0,
    volume: 1.0
};


/**
 * HELPERS
 */

function parseQueryString(search) {
    if (search.charAt(0) != '?') throw new Error("Invalid argument");
    var queryString = {};
    search.substr(1).replace(/\+/g, '%20').split('&').forEach(function (tuple) {
        var tokens = tuple.split('=');
        queryString[decodeURIComponent(tokens[0])] = tokens[1] && decodeURIComponent(tokens[1]);
    })
    return queryString;
}


/**
 * SETTINGS
 */
function getSettings(names) {
    return new Promise(function (fulfill) {
        chrome.storage.local.get(names || ["voiceName", "rate", "volume"], fulfill);
    });
}

function updateSettings(items) {
    return new Promise(function (fulfill) {
        chrome.storage.local.set(items, fulfill);
    });
}

function setState(key, value) {
    var items = {};
    items[key] = value;
    return new Promise(function (fulfill) {
        chrome.storage.local.set(items, fulfill);
    });
}


/**
 * VOICES
 */
function getVoices() {
    return getSettings(["gcpCreds"])
        .then(function (settings) {
            return Promise.all([
                googleTranslateTtsEngine.getVoices(),
            ])
        })
        .then(function (arr) {
            return Array.prototype.concat.apply([], arr);
        })
}

function isGoogleTranslate() {
    return true;
}

function isRemoteVoice() {
    return true;
}

function getSpeechVoice(voiceName, lang) {
    return Promise.all([getVoices()])
        .then(function (res) {
            var voices = res[0];
            var voice;
            if (voiceName) voice = findVoiceByName(voices, voiceName);
            if (!voice && lang) {
                voice = findVoiceByLang(voices.filter(negate(isRemoteVoice)), lang)
                    || findVoiceByLang(voices.filter(isGoogleTranslate), lang)
                    || findVoiceByLang(voices, lang);
                if (voice && isRemoteVoice()) voice = Object.assign({ autoSelect: true }, voice);
            }
            return voice;
        })
}

function findVoiceByName(voices, name) {
    for (var i = 0; i < voices.length; i++) if (voices[i].voiceName == name) return voices[i];
    return null;
}

function findVoiceByLang(voices, lang) {
    var speechLang = parseLang(lang);
    var match = {};
    voices.forEach(function (voice) {
        if (voice.lang) {
            var voiceLang = parseLang(voice.lang);
            if (voiceLang.lang == speechLang.lang) {
                //language matches
                if (voiceLang.rest == speechLang.rest) {
                    //dialect matches, prefer female
                    if (voice.gender == "female") match.first = match.first || voice;
                    else match.second = match.second || voice;
                }
                else if (!voiceLang.rest) {
                    //voice specifies no dialect
                    match.third = match.third || voice;
                }
                else {
                    //dialect mismatch, prefer en-US (if english)
                    if (voiceLang.lang == 'en' && voiceLang.rest == 'us') match.fourth = match.fourth || voice;
                    else match.sixth = match.sixth || voice;
                }
            }
        }
        else {
            //voice specifies no language, assume can handle any lang
            match.fifth = match.fifth || voice;
        }
    });
    return match.first || match.second || match.third || match.fourth || match.fifth || match.sixth;
}

function negate(pred) {
    return function () {
        return !pred.apply(this, arguments);
    }
}

function extraAction(action) {
    return function (data) {
        return Promise.resolve(action(data))
            .then(function () { return data })
    }
}

function parseLang(lang) {
    var tokens = lang.toLowerCase().replace(/_/g, '-').split(/-/, 2);
    return {
        lang: tokens[0],
        rest: tokens[1]
    };
}

function assert(truthy, message) {
    if (!truthy) throw new Error(message || "Assertion failed");
}

function urlEncode(oData) {
    if (oData == null) return null;
    var parts = [];
    for (var key in oData) parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(oData[key]));
    return parts.join("&");
}

function ajaxGet(sUrl) {
    var opts = typeof sUrl == "string" ? { url: sUrl } : sUrl;
    return fetch(opts.url, { headers: opts.headers })
        .then(res => {
            if (!res.ok) throw new Error("Server returns " + res.status)
            switch (opts.responseType) {
                case "json": return res.json()
                case "blob": return res.blob()
                default: return res.text()
            }
        })
}

function ajaxPost(sUrl, oData, sType) {
    return fetch(sUrl, {
        method: "POST",
        headers: {
            "Content-Type": sType == "json" ? "application/json" : "application/x-www-form-urlencoded"
        },
        body: sType == "json" ? JSON.stringify(oData) : urlEncode(oData)
    })
        .then(res => {
            if (!res.ok) throw new Error("Server returns " + res.status)
            return res.text()
        })
}

function objectAssign(target) { // .length of function is 2
    'use strict';
    if (target == null) throw new TypeError('Cannot convert undefined or null to object');
    var to = Object(target);
    for (var index = 1; index < arguments.length; index++) {
        var nextSource = arguments[index];
        if (nextSource != null) { // Skip over if undefined or null
            for (var nextKey in nextSource) {
                // Avoid bugs when hasOwnProperty is shadowed
                if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                    to[nextKey] = nextSource[nextKey];
                }
            }
        }
    }
    return to;
}

function getUniqueClientId() {
    return getSettings(["uniqueClientId"])
        .then(function (settings) {
            return settings.uniqueClientId || createId(8).then(extraAction(saveId));
        })
    function createId(len) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < len; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
        return Promise.resolve(text);
    }
    function saveId(id) {
        return updateSettings({ uniqueClientId: id });
    }
}

function hasPermissions(perms) {
    return new Promise(function (fulfill) {
        chrome.permissions.contains(perms, fulfill);
    })
}

function getAuthToken(opts) {
    if (!opts) opts = {};
    return getSettings(["authToken"])
        .then(function (settings) {
            return settings.authToken || (opts.interactive ? interactiveLogin().then(extraAction(saveToken)) : null);
        })
    //Note: Cognito webAuthFlow is always interactive (if user already logged in, it shows button "Sign in as <email>" or  "Continue with Google/Facebook/etc")
    function interactiveLogin() {
        return new Promise(function (fulfill, reject) {
            if (!chrome.identity || !chrome.identity.launchWebAuthFlow) return fulfill(null);
            chrome.identity.launchWebAuthFlow({
                interactive: true,
                url: config.webAppUrl + "/login.html?returnUrl=" + chrome.identity.getRedirectURL()
            },
                function (responseUrl) {
                    if (responseUrl) {
                        var index = responseUrl.indexOf("?");
                        var res = parseQueryString(responseUrl.substr(index));
                        if (res.error) reject(new Error(res.error_description || res.error));
                        else fulfill(res.token);
                    }
                    else {
                        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                        else fulfill(null);
                    }
                })
        })
    }
    function saveToken(token) {
        if (token) return updateSettings({ authToken: token });
    }
}

function promiseTimeout(millis, errorMsg, promise) {
    return new Promise(function (fulfill, reject) {
        var timedOut = false;
        var timer = setTimeout(onTimeout, millis);
        promise.then(onFulfill, onReject);

        function onFulfill(value) {
            if (timedOut) return;
            clearTimeout(timer);
            fulfill(value);
        }
        function onReject(err) {
            if (timedOut) return;
            clearTimeout(timer);
            reject(err);
        }
        function onTimeout() {
            timedOut = true;
            reject(new Error(errorMsg));
        }
    })
}

function truncateRepeatedChars(text, max) {
    var result = ""
    var startIndex = 0
    var count = 1
    for (var i = 1; i < text.length; i++) {
        if (text.charCodeAt(i) == text.charCodeAt(i - 1)) {
            count++
            if (count == max) result += text.slice(startIndex, i + 1)
        }
        else {
            if (count >= max) startIndex = i
            count = 1
        }
    }
    if (count < max) result += text.slice(startIndex)
    return result
}


function SimpleSource(texts, opts) {
    opts = opts || {}
    this.ready = Promise.resolve({
        lang: opts.lang,
    })
    this.isWaiting = function () {
        return false;
    }
    this.getCurrentIndex = function () {
        return Promise.resolve(0);
    }
    this.getTexts = function (index) {
        return Promise.resolve(index == 0 ? texts : null);
    }
    this.close = function () {
        return Promise.resolve();
    }
    this.getUri = function () {
        var textLen = texts.reduce(function (sum, text) { return sum + text.length }, 0);
        return "text-selection:(" + textLen + ")" + encodeURIComponent((texts[0] || "").substr(0, 100));
    }
}

function Doc(source, onEnd) {
    var info;
    var currentIndex;
    var activeSpeech;
    var ready = Promise.resolve(source.getUri())
        .then(function (uri) { return setState("lastUrl", uri) })
        .then(function () { return source.ready })
        .then(function (result) { info = result })
    var foundText;

    this.close = close;
    this.play = play;
    this.stop = stop;
    this.getState = getState;
    this.getActiveSpeech = getActiveSpeech;

    //method close
    function close() {
        return ready
            .catch(function () { })
            .then(function () {
                if (activeSpeech) activeSpeech.stop().then(function () { activeSpeech = null });
                source.close();
            })
    }

    //method play
    function play() {
        return ready
            .then(function () {
                if (activeSpeech) return activeSpeech.play();
                else {
                    return source.getCurrentIndex()
                        .then(function (index) { currentIndex = index })
                        .then(function () { return readCurrent() })
                }
            })
    }

    function readCurrent(rewinded) {
        return source.getTexts(currentIndex)
            .catch(function () {
                return null;
            })
            .then(function (texts) {
                if (texts) {
                    if (texts.length) {
                        foundText = true;
                        return read(texts);
                    }
                    else {
                        currentIndex++;
                        return readCurrent();
                    }
                }
                else {
                    if (!foundText) throw new Error(JSON.stringify({ code: "error_no_text" }))
                    if (onEnd) onEnd()
                }
            })
        function read(texts) {
            texts = texts.map(preprocess)
            return Promise.resolve()
                // .then(function () {
                //   if (info.detectedLang == null)
                //     return detectLanguage(texts)
                //       .then(function (lang) {
                //         info.detectedLang = lang || "";
                //       })
                // })
                .then(getSpeech.bind(null, texts))
                .then(function (speech) {
                    if (activeSpeech) return;
                    activeSpeech = speech;
                    activeSpeech.onEnd = function (err) {
                        if (err) {
                            if (onEnd) onEnd(err);
                        }
                        else {
                            activeSpeech = null;
                            currentIndex++;
                            readCurrent()
                                .catch(function (err) {
                                    if (onEnd) onEnd(err)
                                })
                        }
                    };
                    if (rewinded) activeSpeech.gotoEnd();
                    return activeSpeech.play();
                })
        }
        function preprocess(text) {
            text = truncateRepeatedChars(text, 3)
            return text.replace(/https?:\/\/\S+/g, "HTTP URL.")
        }
    }

    async function getSpeech(texts) {
        const settings = await getSettings();
        //console.log("Declared", info.lang);
        var lang = info.lang;
        //console.log("Chosen", lang);

        let options = {};
        let speechSettings;

        const result = await chrome.storage.local.get('speechSettings');
        if (result.speechSettings) {
            speechSettings = result.speechSettings;

            // Assuming speechSettings.speechSpeed is within the range of 1.5-3
            const originalSpeechSpeed = speechSettings.speechSpeed;
            const minRange1 = 1.5;  // Minimum value of the original range
            const maxRange1 = 3;    // Maximum value of the original range
            const minRange2 = 1.3;  // Minimum value of the target range
            const maxRange2 = 2.5;  // Maximum value of the target range

            // Scale the value to the target range
            const scaledSpeechSpeed = ((originalSpeechSpeed - minRange1) / (maxRange1 - minRange1)) * (maxRange2 - minRange2) + minRange2;

            // Round the result to one decimal place
            const roundedSpeechSpeed = Math.round(scaledSpeechSpeed * 10) / 10;

            options = {
                rate: roundedSpeechSpeed || defaults.rate,
                volume: speechSettings.speechVolume || defaults.volume,
                lang: config.langMap[lang] || lang || 'en-US',
            };
        } else {
            options = {
                rate: settings.rate || defaults.rate,
                volume: settings.volume || defaults.volume,
                lang: config.langMap[lang] || lang || 'en-US',
            };
        }

        const voice = await getSpeechVoice(settings.voiceName, options.lang);
        if (!voice) throw new Error(JSON.stringify({ code: "error_no_voice", lang: options.lang }));

        options.voice = voice;
        return new Speech(texts, options);
    }


    //method stop
    function stop() {
        return ready
            .then(function () {
                if (activeSpeech) return activeSpeech.stop().then(function () { activeSpeech = null });
            })
    }

    //method getState
    function getState() {
        if (activeSpeech) return activeSpeech.getState();
        else return Promise.resolve(source.isWaiting() ? "LOADING" : "STOPPED");
    }

    //method getActiveSpeech
    function getActiveSpeech() {
        return Promise.resolve(activeSpeech);
    }
}


var activeDoc;
var playbackError = null;
var silenceLoop = new Audio("sound/silence.mp3");
silenceLoop.loop = true;

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message) => {
    stop()
        .then(function () {
            return playText(message.info.selectionText, message.info.lang)
        })
        .catch(console.error)

});

/**
 * METHODS
 */
function playText(text, opts) {
    opts = opts || {}
    playbackError = null
    if (!activeDoc) {
        openDoc(new SimpleSource(text.split(/(?:\r?\n){2,}/), { lang: opts }), function (err) {
            if (err) playbackError = err
        })
    }
    return activeDoc.play()
        .catch(function (err) {
            closeDoc();
            throw err;
        })
}

function stop() {
    if (activeDoc) {
        activeDoc.stop();
        closeDoc();
        return Promise.resolve();
    }
    else return Promise.resolve();
}

function getPlaybackState() {
    if (activeDoc) return activeDoc.getState();
    else return Promise.resolve("STOPPED");
}

function getActiveSpeech() {
    if (activeDoc) return activeDoc.getActiveSpeech();
    else return Promise.resolve(null);
}

function openDoc(source, onEnd) {
    activeDoc = new Doc(source, function (err) {
        closeDoc();
        if (typeof onEnd == "function") onEnd(err);
    })
    silenceLoop.play();
}

function closeDoc() {
    if (activeDoc) {
        activeDoc.close();
        activeDoc = null;
    }
}


(function () {
    var got = {
        get: function (url) {
            return ajaxGet(url).then(function (x) { return { body: x } });
        },
        post: function (url, opts) {
            return ajaxPost(url + "?" + urlEncode(opts.searchParams), opts.form).then(function (x) { return { body: x } });
        }
    };

    var config = {
        get: function (key) {
            return getSettings([key]).then(function (settings) { return settings[key] });
        },
        set: function (key, value) {
            var settings = {};
            settings[key] = value;
            return updateSettings(settings);
        }
    };

    var batchNumber = 0;


    /**
     * @param {string} rpcId                    ID of service to call
     * @param {Array} payload                   Arguments for the service call
     * @param {string} [opts.tld="com"]         translate.google.[tld]
     * @param {number} [opts.tokensTTL=3600]    How long to cache tokens
     */
    function batchExecute(rpcId, payload, opts) {
        if (!opts) opts = {};
        if (!opts.tld) opts.tld = "com";
        if (!opts.tokensTTL) opts.tokensTTL = 3600;

        var url = "https://translate.google." + opts.tld;

        return Promise.resolve(config.get("wiz"))
            .then(function (wiz) {
                if (wiz && (wiz.timestamp + opts.tokensTTL * 1000) > Date.now()) return wiz;
                return fetchWizGlobalData(url)
                    .then(function (wiz) {
                        wiz.timestamp = Date.now();
                        config.set("wiz", wiz);
                        return wiz;
                    })
            })
            .then(function (wiz) {
                return getBatchExecuteParams(wiz, rpcId, payload);
            })
            .then(function (params) {
                if (opts.validateOnly) return;
                if (!params.body.at) delete params.body.at;
                return got.post(url + "/_/TranslateWebserverUi/data/batchexecute", {
                    searchParams: params.query,
                    form: params.body,
                    responseType: "text"
                })
                    .then(function (res) {
                        var match = res.body.match(/\d+/);
                        return res.body.substr(match.index + match[0].length, Number(match[0]));
                    })
                    .then(JSON.parse)
                    .then(function (envelopes) {
                        var payload = envelopes[0][2];
                        return JSON.parse(payload);
                    })
            })
    }


    function fetchWizGlobalData(url) {
        var propFinder = {
            "f.sid": /"FdrFJe":"(.*?)"/,
            "bl": /"cfb2h":"(.*?)"/,
            "at": /"SNlM0e":"(.*?)"/,
        }
        return got.get(url)
            .then(function (res) {
                var start = res.body.indexOf("WIZ_global_data = {");
                if (start == -1) throw new Error("Wiz not found");
                var end = res.body.indexOf("</script>", start);
                return res.body.substring(start, end);
            })
            .then(function (text) {
                var wiz = {};
                for (var prop in propFinder) {
                    var match = propFinder[prop].exec(text);
                    if (match) wiz[prop] = match[1];
                    else console.warn("Wiz property not found '" + prop + "'");
                }
                return wiz;
            })
    }


    function getBatchExecuteParams(wiz, rpcId, payload) {
        if (!Array.isArray(payload)) throw new Error("Payload must be an array");
        return {
            query: {
                "rpcids": rpcId,
                "f.sid": wiz["f.sid"],
                "bl": wiz["bl"],
                "hl": "en",
                "soc-app": 1,
                "soc-platform": 1,
                "soc-device": 1,
                "_reqid": (++batchNumber * 100000) + Math.floor(1000 + (Math.random() * 9000)),
                "rt": "c"
            },
            body: {
                "f.req": JSON.stringify([[[rpcId, JSON.stringify(payload), null, "generic"]]]),
                "at": wiz["at"]
            }
        }
    }


    window.googleTranslateReady = function () {
        return batchExecute("jQ1olc", [], { validateOnly: true });
    }

    window.googleTranslateSynthesizeSpeech = function (text, lang) {
        return batchExecute("jQ1olc", [text, lang, null])
            .then(function (payload) {
                if (!payload) throw new Error("Failed to synthesize text '" + text.slice(0, 25) + "…' in language " + lang)
                return "data:audio/mpeg;base64," + payload[0];
            })
    }
})();


function Speech(texts, options) {
    for (var i = 0; i < texts.length; i++) if (/[\w)]$/.test(texts[i])) texts[i] += '.';

    var self = this;
    var engine;
    var state = "IDLE";
    var index = 0;
    var delayedPlayTimer;
    var ready = Promise.resolve(pickEngine())
        .then(function (x) {
            engine = x;
            if (texts.length) texts = getChunks(texts.join("\n\n"));
        })

    this.options = options;
    this.play = play;
    this.stop = stop;
    this.getState = getState;
    this.getPosition = getPosition;
    this.forward = forward;
    this.rewind = rewind;
    this.seek = seek;
    this.gotoEnd = gotoEnd;

    function pickEngine() {
        if (isGoogleTranslate() && !/\s(Hebrew|Telugu)$/.test(options.voice.voiceName)) {
            return googleTranslateTtsEngine.ready()
                .then(function () { return googleTranslateTtsEngine })
                .catch(function (err) {
                    if (/^{/.test(err.message)) throw err
                    console.warn("GoogleTranslate unavailable,", err);
                    options.voice.autoSelect = true;
                    options.voice.voiceName = "Microsoft US English (Zira)";
                    return remoteTtsEngine;
                })
        }
        if (isRemoteVoice()) return remoteTtsEngine;
        return browserTtsEngine;
    }

    function getChunks(text) {
        var isEA = /^zh|ko|ja/.test(options.lang);
        var punctuator = isEA ? new EastAsianPunctuator() : new LatinPunctuator();

        if (isGoogleTranslate()) return new CharBreaker(200, punctuator).breakText(text);
        else return new CharBreaker(750, punctuator, 200).breakText(text);
    }

    function getState() {
        if (!engine) return "LOADING";
        return new Promise(function (fulfill) {
            engine.isSpeaking(function (isSpeaking) {
                if (state == "PLAYING") fulfill(isSpeaking ? "PLAYING" : "LOADING");
            })
        })
    }

    function getPosition() {
        return {
            index: index,
            texts: texts,
            isRTL: /^(ar|az|dv|he|iw|ku|fa|ur)\b/.test(options.lang),
        }
    }

    function play() {
        if (index >= texts.length) {
            state = "IDLE";
            if (self.onEnd) self.onEnd();
            return Promise.resolve();
        }
        else {
            state = new String("PLAYING");
            state.startTime = new Date().getTime();
            return ready
                .then(function () {
                    return speak(texts[index],
                        function () {
                            state = "IDLE";
                            index++;
                            play()
                                .catch(function (err) {
                                    if (self.onEnd) self.onEnd(err)
                                })
                        },
                        function (err) {
                            state = "IDLE";
                            if (self.onEnd) self.onEnd(err);
                        })
                })
                .then(function () {
                    if (texts[index + 1] && engine.prefetch) engine.prefetch(texts[index + 1], options);
                })
        }
    }

    function delayedPlay() {
        clearTimeout(delayedPlayTimer);
        delayedPlayTimer = setTimeout(function () { stop().then(play) }, 750);
        return Promise.resolve();
    }

    function stop() {
        return ready
            .then(function () {
                clearTimeout(delayedPlayTimer);
                engine.stop();
                state = "IDLE";
            })
    }

    function forward() {
        if (index + 1 < texts.length) {
            index++;
            if (state == "PLAYING") return delayedPlay()
            else return stop()
        }
        else return Promise.reject(new Error("Can't forward, at end"));
    }

    function rewind() {
        if (state == "PLAYING" && new Date().getTime() - state.startTime > 3 * 1000) {
            return stop().then(play);
        }
        else if (index > 0) {
            index--;
            if (state == "PLAYING") return stop().then(play)
            else return stop()
        }
        else return Promise.reject(new Error("Can't rewind, at beginning"));
    }

    function seek(n) {
        index = n;
        return play();
    }

    function gotoEnd() {
        index = texts.length && texts.length - 1;
    }

    function speak(text, onEnd, onError) {
        var state = "IDLE";
        return new Promise(function (fulfill, reject) {
            engine.speak(text, options, function (event) {
                if (event.type == "start") {
                    if (state == "IDLE") {
                        fulfill();
                        state = "STARTED";
                    }
                }
                else if (event.type == "end") {
                    if (state == "IDLE") {
                        reject(new Error("TTS engine end event before start event"));
                        state = "ERROR";
                    }
                    else if (state == "STARTED") {
                        onEnd();
                        state = "ENDED";
                    }
                }
                else if (event.type == "error") {
                    if (state == "IDLE") {
                        reject(new Error(event.errorMessage || "Unknown TTS error"));
                        state = "ERROR";
                    }
                    else if (state == "STARTED") {
                        onError(new Error(event.errorMessage || "Unknown TTS error"));
                        state = "ERROR";
                    }
                }
            })
        })
    }

    function CharBreaker(charLimit, punctuator, paragraphCombineThreshold) {
        this.breakText = breakText;
        function breakText(text) {
            return merge(punctuator.getParagraphs(text), breakParagraph, paragraphCombineThreshold);
        }
        function breakParagraph(text) {
            return merge(punctuator.getSentences(text), breakSentence);
        }
        function breakSentence(sentence) {
            return merge(punctuator.getPhrases(sentence), breakPhrase);
        }
        function breakPhrase(phrase) {
            return merge(punctuator.getWords(phrase), breakWord);
        }
        function breakWord(word) {
            var result = [];
            while (word) {
                result.push(word.slice(0, charLimit));
                word = word.slice(charLimit);
            }
            return result;
        }
        function merge(parts, breakPart, combineThreshold) {
            var result = [];
            var group = { parts: [], charCount: 0 };
            var flush = function () {
                if (group.parts.length) {
                    result.push(group.parts.join(""));
                    group = { parts: [], charCount: 0 };
                }
            };
            parts.forEach(function (part) {
                var charCount = part.length;
                if (charCount > charLimit) {
                    flush();
                    var subParts = breakPart(part);
                    for (var i = 0; i < subParts.length; i++) result.push(subParts[i]);
                }
                else {
                    if (group.charCount + charCount > (combineThreshold || charLimit)) flush();
                    group.parts.push(part);
                    group.charCount += charCount;
                }
            });
            flush();
            return result;
        }
    }

    //punctuators

    function LatinPunctuator() {
        this.getParagraphs = function (text) {
            return recombine(text.split(/((?:\r?\n\s*){2,})/));
        }
        this.getSentences = function (text) {
            return recombine(text.split(/([.!?]+[\s\u200b]+)/), /\b(\w|[A-Z][a-z]|Assn|Ave|Capt|Col|Comdr|Corp|Cpl|Gen|Gov|Hon|Inc|Lieut|Ltd|Rev|Univ|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec|dept|ed|est|vol|vs)\.\s+$/);
        }
        this.getPhrases = function (sentence) {
            return recombine(sentence.split(/([,;:]\s+|\s-+\s+|—\s*)/));
        }
        this.getWords = function (sentence) {
            var tokens = sentence.trim().split(/([~@#%^*_+=<>]|[\s\-—/]+|\.(?=\w{2,})|,(?=[0-9]))/);
            var result = [];
            for (var i = 0; i < tokens.length; i += 2) {
                if (tokens[i]) result.push(tokens[i]);
                if (i + 1 < tokens.length) {
                    if (/^[~@#%^*_+=<>]$/.test(tokens[i + 1])) result.push(tokens[i + 1]);
                    else if (result.length) result[result.length - 1] += tokens[i + 1];
                }
            }
            return result;
        }
        function recombine(tokens, nonPunc) {
            var result = [];
            for (var i = 0; i < tokens.length; i += 2) {
                var part = (i + 1 < tokens.length) ? (tokens[i] + tokens[i + 1]) : tokens[i];
                if (part) {
                    if (nonPunc && result.length && nonPunc.test(result[result.length - 1])) result[result.length - 1] += part;
                    else result.push(part);
                }
            }
            return result;
        }
    }

    function EastAsianPunctuator() {
        this.getParagraphs = function (text) {
            return recombine(text.split(/((?:\r?\n\s*){2,})/));
        }
        this.getSentences = function (text) {
            return recombine(text.split(/([.!?]+[\s\u200b]+|[\u3002\uff01]+)/));
        }
        this.getPhrases = function (sentence) {
            return recombine(sentence.split(/([,;:]\s+|[\u2025\u2026\u3000\u3001\uff0c\uff1b]+)/));
        }
        this.getWords = function (sentence) {
            return sentence.replace(/\s+/g, "").split("");
        }
        function recombine(tokens) {
            var result = [];
            for (var i = 0; i < tokens.length; i += 2) {
                if (i + 1 < tokens.length) result.push(tokens[i] + tokens[i + 1]);
                else if (tokens[i]) result.push(tokens[i]);
            }
            return result;
        }
    }
}

var browserTtsEngine = chrome.tts ? new BrowserTtsEngine() : (typeof speechSynthesis != 'undefined' ? new WebSpeechEngine() : new DummyTtsEngine());
var remoteTtsEngine = new RemoteTtsEngine(config.serviceUrl);
var googleTranslateTtsEngine = new GoogleTranslateTtsEngine();

/*
interface Options {
  voice: {
    voiceName: string
    autoSelect?: boolean
  }
  lang: string
  rate?: number
  volume?: number
}

interface Event {
  type: string
}

interface Voice {
  voiceName: string
  lang: string
}

interface TtsEngine {
  speak: function(text: string, opts: Options, onEvent: (e:Event) => void): void
  stop: function(): void
  isSpeaking: function(callback): void
  getVoices: function(): Voice[]
}
*/

function BrowserTtsEngine() {
    this.speak = function (text, options, onEvent) {
        chrome.tts.speak(text, {
            voiceName: options.voice.voiceName,
            lang: options.lang,
            rate: options.rate,
            volume: options.volume,
            requiredEventTypes: ["start", "end"],
            desiredEventTypes: ["start", "end", "error"],
            onEvent: onEvent
        })
    }
    this.stop = chrome.tts.stop;
    this.isSpeaking = chrome.tts.isSpeaking;
    this.getVoices = function () {
        return new Promise(function (fulfill) {
            chrome.tts.getVoices(function (voices) {
                fulfill(voices || []);
            })
        })
    }
}


function WebSpeechEngine() {
    var utter;
    this.speak = function (text, options, onEvent) {
        utter = new SpeechSynthesisUtterance();
        utter.text = text;
        utter.voice = options.voice;
        if (options.lang) utter.lang = options.lang;
        if (options.rate) utter.rate = options.rate;
        if (options.volume) utter.volume = options.volume;
        utter.onstart = onEvent.bind(null, { type: 'start', charIndex: 0 });
        utter.onend = onEvent.bind(null, { type: 'end', charIndex: text.length });
        utter.onerror = function (event) {
            onEvent({ type: 'error', errorMessage: event.error });
        };
        speechSynthesis.speak(utter);
    }
    this.stop = function () {
        if (utter) utter.onend = null;
        speechSynthesis.cancel();
    }
    this.isSpeaking = function (callback) {
        callback(speechSynthesis.speaking);
    }
    this.getVoices = function () {
        return promiseTimeout(1500, "Timeout WebSpeech getVoices", new Promise(function (fulfill) {
            var voices = speechSynthesis.getVoices() || [];
            if (voices.length) fulfill(voices);
            else speechSynthesis.onvoiceschanged = function () {
                fulfill(speechSynthesis.getVoices() || []);
            }
        }))
            .then(function (voices) {
                for (var i = 0; i < voices.length; i++) voices[i].voiceName = voices[i].name;
                return voices;
            })
            .catch(function (err) {
                console.error(err);
                return [];
            })
    }
}


function DummyTtsEngine() {
    this.getVoices = function () {
        return Promise.resolve([]);
    }
}

function RemoteTtsEngine(serviceUrl) {
    var manifest = chrome.runtime.getManifest();
    var iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
    var audio = document.createElement("AUDIO");
    var isSpeaking = false;
    var nextStartTime = 0;
    var waitTimer;
    var authToken;
    var clientId;
    var speakPromise;
    function ready(options) {
        return getAuthToken()
            .then(function (token) { authToken = token })
            .then(getUniqueClientId)
            .then(function (id) { clientId = id })
    }
    this.speak = function (utterance, options, onEvent) {
        if (!options.volume) options.volume = 1;
        if (!options.rate) options.rate = 1;
        if (!iOS) {
            audio.volume = options.volume;
            audio.defaultPlaybackRate = options.rate;
        }
        speakPromise = ready(options)
            .then(function () {
                audio.src = getAudioUrl(utterance, options.lang, options.voice);
                return new Promise(function (fulfill) { audio.oncanplay = fulfill });
            })
            .then(function () {
                var waitTime = nextStartTime - Date.now();
                if (waitTime > 0) return new Promise(function (f) { waitTimer = setTimeout(f, waitTime) });
            })
            .then(function () {
                isSpeaking = true;
                return audio.play();
            })
            .catch(function (err) {
                onEvent({
                    type: "error",
                    errorMessage: err.name == "NotAllowedError" ? JSON.stringify({ code: "error_user_gesture_required" }) : err.message
                })
            })
        audio.onplay = onEvent.bind(null, { type: 'start', charIndex: 0 });
        audio.onended = function () {
            onEvent({ type: 'end', charIndex: utterance.length });
            isSpeaking = false;
        };
        audio.onerror = function () {
            onEvent({ type: "error", errorMessage: audio.error.message });
            isSpeaking = false;
        };
        audio.load();
    }
    this.isSpeaking = function (callback) {
        callback(isSpeaking);
    }
    this.prefetch = function (utterance, options) {
        if (!iOS) {
            ajaxGet(getAudioUrl(utterance, options.lang, options.voice, true));
        }
    }
    this.setNextStartTime = function (time, options) {
        if (!iOS)
            nextStartTime = time || 0;
    }
    this.getVoices = function () {
        return voices;
    }
    function getAudioUrl(utterance, lang, voice, prefetch) {
        assert(utterance && lang && voice);
        return serviceUrl + "/read-aloud/speak/" + lang + "/" + encodeURIComponent(voice.voiceName) + "?c=" + encodeURIComponent(clientId) + "&t=" + encodeURIComponent(authToken) + (voice.autoSelect ? '&a=1' : '') + "&v=" + manifest.version + "&pf=" + (prefetch ? 1 : 0) + "&q=" + encodeURIComponent(utterance);
    }
    var voices = [
        {},
    ]
        .map(function (item) {
            return { voiceName: item.voice_name, lang: item.lang };
        })
        .concat(
            { voiceName: "ReadAloud Generic Voice", autoSelect: true },
        )
}


function GoogleTranslateTtsEngine() {
    var audio = document.createElement("AUDIO");
    var prefetchAudio;
    var isSpeaking = false;
    var speakPromise;
    this.ready = function () {
        return hasPermissions(config.gtranslatePerms)
            .then(function (granted) {
                if (!granted) throw new Error(JSON.stringify({ code: "error_gtranslate_auth_required" }))
            })
            .then(googleTranslateReady)
    };
    this.speak = function (utterance, options, onEvent) {
        if (!options.volume) options.volume = 1;
        if (!options.rate) options.rate = 1;
        audio.volume = options.volume;
        audio.defaultPlaybackRate = options.rate * 1.1;
        audio.onplay = function () {
            onEvent({ type: 'start', charIndex: 0 });
            isSpeaking = true;
        };
        audio.onended = function () {
            onEvent({ type: 'end', charIndex: utterance.length });
            isSpeaking = false;
        };
        audio.onerror = function () {
            onEvent({ type: "error", errorMessage: audio.error.message });
            isSpeaking = false;
        };
        speakPromise = Promise.resolve()
            .then(function () {
                if (prefetchAudio && prefetchAudio[0] == utterance && prefetchAudio[1] == options) return prefetchAudio[2];
                else return getAudioUrl(utterance, options.voice.lang);
            })
            .then(function (url) {
                audio.src = url;
                return audio.play();
            })
            .catch(function (err) {
                onEvent({
                    type: "error",
                    errorMessage: err.name == "NotAllowedError" ? JSON.stringify({ code: "error_user_gesture_required" }) : err.message
                })
            })
    };
    this.isSpeaking = function (callback) {
        callback(isSpeaking);
    };
    this.prefetch = function (utterance, options) {
        getAudioUrl(utterance, options.voice.lang)
            .then(function (url) {
                prefetchAudio = [utterance, options, url];
            })
            .catch(console.error)
    };
    this.setNextStartTime = function () {
    };
    this.getVoices = function () {
        return voices;
    }
    function getAudioUrl(text, lang) {
        assert(text && lang);
        return googleTranslateSynthesizeSpeech(text, lang);
    }
    var voices = [
        { "voice_name": "GoogleTranslate Afrikaans", "lang": "af", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Albanian", "lang": "sq", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Arabic", "lang": "ar", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Armenian", "lang": "hy", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Bengali", "lang": "bn", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Bosnian", "lang": "bs", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Bulgarian", "lang": "bg", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Catalan", "lang": "ca", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Chinese", "lang": "zh-CN", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Croatian", "lang": "hr", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Czech", "lang": "cs", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Danish", "lang": "da", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Dutch", "lang": "nl", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate English", "lang": "en", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Esperanto", "lang": "eo", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Estonian", "lang": "et", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Filipino", "lang": "fil", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Finnish", "lang": "fi", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate French", "lang": "fr", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate German", "lang": "de", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Greek", "lang": "el", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Gujarati", "lang": "gu", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Hebrew", "lang": "he", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Hindi", "lang": "hi", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Hungarian", "lang": "hu", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Icelandic", "lang": "is", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Indonesian", "lang": "id", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Italian", "lang": "it", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Japanese", "lang": "ja", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Javanese", "lang": "jw", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Kannada", "lang": "kn", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Khmer", "lang": "km", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Korean", "lang": "ko", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Latin", "lang": "la", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Latvian", "lang": "lv", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Macedonian", "lang": "mk", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Malay", "lang": "ms", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Malayalam", "lang": "ml", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Marathi", "lang": "mr", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Myanmar (Burmese)", "lang": "my", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Nepali", "lang": "ne", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Norwegian", "lang": "no", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Polish", "lang": "pl", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Portuguese", "lang": "pt", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Romanian", "lang": "ro", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Russian", "lang": "ru", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Serbian", "lang": "sr", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Sinhala", "lang": "si", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Slovak", "lang": "sk", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Spanish", "lang": "es", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Sundanese", "lang": "su", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Swahili", "lang": "sw", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Swedish", "lang": "sv", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Tagalog", "lang": "tl", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Tamil", "lang": "ta", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Telugu", "lang": "te", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Thai", "lang": "th", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Turkish", "lang": "tr", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Ukrainian", "lang": "uk", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Urdu", "lang": "ur", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Vietnamese", "lang": "vi", "event_types": ["start", "end", "error"] },
        { "voice_name": "GoogleTranslate Welsh", "lang": "cy", "event_types": ["start", "end", "error"] }
    ]
        .map(function (item) {
            return { voiceName: item.voice_name, lang: item.lang };
        })
}
