// Copyright 2012 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

goog.require('axs.AuditRule');

goog.provide('axs.ExtensionAuditRule');


/**
 * @extends {axs.AuditRule}
 * @constructor
 * @param {axs.AuditRule.Spec} spec
 */
axs.ExtensionAuditRule = function(spec) {
    axs.AuditRule.call(this, spec);

    /** @type {boolean} */
    this.requiresConsoleAPI = !!spec['opt_requiresConsoleAPI'];
};
goog.inherits(axs.ExtensionAuditRule, axs.AuditRule);

/**
 * Add the given element to the given array. This is to abstract calls to
 * convertNodeToResult() away from the main code.
 * @param {Array.<Element>} elements
 * @param {Element} element
 */
axs.ExtensionAuditRule.prototype.addElement = function(elements, element) {
    elements.push(axs.content.convertNodeToResult(element));
};

axs.ExtensionAuditRule.prototype.runInDevtools = function(resultsCallback) {
    var extensionId = chrome.i18n.getMessage("@@extension_id"); // yes, really.
    var uniqueEventName = extensionId + '-' + this.name;

    function addEventListener(uniqueEventName, test, addElement) {
        function handleEventListenersEvent(event) {
            var element = event.target;
            window.relevantNodes.push(element);
            if (test(element))
                addElement(window.failingNodes, element, true);
        }
        window.relevantNodes = [];
        window.failingNodes = [];
        document.addEventListener(uniqueEventName, handleEventListenersEvent, false);
    }
    chrome.devtools.inspectedWindow.eval('(' + addEventListener + ')("'+
                                         uniqueEventName + '", ' + this.test_ +
                                         ', ' + this.addElement  + ')',
                                         { useContentScriptContext: true });

    function sendRelevantNodesToContentScript(matcher, eventName) {
        var relevantElements = [];
        axs.AuditRule.collectMatchingElements(document, matcher, relevantElements);
        for (var i = 0; i < relevantElements.length; i++) {
            var node = relevantElements[i];
            var event = document.createEvent('Event');
            event.initEvent(eventName, true, false);
            node.dispatchEvent(event);
        }
    }
    var stringToEval = '(function() { var axs = {};\n' +
        'axs.utils = {};\n' +
        // TODO all of axs.utils? Have selected methods in AuditRule?
        'axs.utils.isElementHidden = ' + axs.utils.isElementHidden + ';\n' +
        'axs.utils.isElementOrAncestorHidden = ' + axs.utils.isElementOrAncestorHidden + ';\n' +
        'axs.utils.isElementImplicitlyFocusable = ' + axs.utils.isElementImplicitlyFocusable + ';\n' +
        'axs.AuditRule = {};\n' +
        'axs.AuditRule.collectMatchingElements = ' + axs.AuditRule.collectMatchingElements + ';\n' +
        'var relevantElementMatcher = ' + this.relevantElementMatcher_ + ';\n' +
        'var sendRelevantNodesToContentScript = ' + sendRelevantNodesToContentScript + ';\n' +
        'sendRelevantNodesToContentScript(relevantElementMatcher, "' +
        uniqueEventName + '"); })()';
    chrome.devtools.inspectedWindow.eval(stringToEval);

    function retrieveResults() {
        var result = axs.constants.AuditResult.NA;
        if (window.relevantNodes.length)
            result = window.failingNodes.length ? axs.constants.AuditResult.FAIL : axs.constants.AuditResult.PASS;

        return { result: result, elements: window.failingNodes };
    }
    chrome.devtools.inspectedWindow.eval('(' + retrieveResults + ')()',
                                         { useContentScriptContext: true },
                                         resultsCallback)
};
