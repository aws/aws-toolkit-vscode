'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
var __createBinding =
    (this && this.__createBinding) ||
    (Object.create
        ? function(o, m, k, k2) {
              if (k2 === undefined) k2 = k
              Object.defineProperty(o, k2, {
                  enumerable: true,
                  get: function() {
                      return m[k]
                  },
              })
          }
        : function(o, m, k, k2) {
              if (k2 === undefined) k2 = k
              o[k2] = m[k]
          })
var __setModuleDefault =
    (this && this.__setModuleDefault) ||
    (Object.create
        ? function(o, v) {
              Object.defineProperty(o, 'default', { enumerable: true, value: v })
          }
        : function(o, v) {
              o['default'] = v
          })
var __importStar =
    (this && this.__importStar) ||
    function(mod) {
        if (mod && mod.__esModule) return mod
        var result = {}
        if (mod != null)
            for (var k in mod)
                if (k !== 'default' && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k)
        __setModuleDefault(result, mod)
        return result
    }
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function(resolve) {
                      resolve(value)
                  })
        }
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value))
                } catch (e) {
                    reject(e)
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value))
                } catch (e) {
                    reject(e)
                }
            }
            function step(result) {
                result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected)
            }
            step((generator = generator.apply(thisArg, _arguments || [])).next())
        })
    }
var __importDefault =
    (this && this.__importDefault) ||
    function(mod) {
        return mod && mod.__esModule ? mod : { default: mod }
    }
Object.defineProperty(exports, '__esModule', { value: true })
exports.getLanguageServiceSSMJSON = exports.getLanguageServiceSSMYAML = exports.getLanguageServiceSSM = exports.getDocumentTemplate = exports.ast = exports.supportedDocumentTypes = exports.automationActions = exports.plugins = exports.JsonLS = void 0
const JsonLS = __importStar(require('vscode-json-languageservice'))
exports.JsonLS = JsonLS
const YAML = __importStar(require('yaml'))
const yaml_language_server_1 = require('yaml-language-server')
const yamlParser07_1 = require('yaml-language-server/out/server/src/languageservice/parser/yamlParser07')
const path_1 = require('path')
const complete_1 = require('./completion/complete')
const constants_1 = require('./constants/constants')
Object.defineProperty(exports, 'plugins', {
    enumerable: true,
    get: function() {
        return constants_1.plugins
    },
})
Object.defineProperty(exports, 'supportedDocumentTypes', {
    enumerable: true,
    get: function() {
        return constants_1.supportedDocumentTypes
    },
})
const ssmdocschema_json_1 = __importDefault(require('./json-schema/ssmdocschema.json'))
const validate_1 = require('./validation/validate')
const parameterObject_json_1 = __importDefault(require('./json-schema/partial/parameterObject.json'))
const automationSnippets_json_1 = __importDefault(require('./json-schema/partial/snippets/automationSnippets.json'))
const commandSnippets_json_1 = __importDefault(require('./json-schema/partial/snippets/commandSnippets.json'))
const automation_json_1 = __importDefault(require('./templates/automation.json'))
const command_json_1 = __importDefault(require('./templates/command.json'))
const automationActions = Object.keys(constants_1.automationAction)
exports.automationActions = automationActions
const ast = __importStar(require('./util/astFunctions'))
exports.ast = ast
function getDocumentTemplate(documenType) {
    if (documenType === 'command') {
        return command_json_1.default
    } else if (documenType === 'automation') {
        return automation_json_1.default
    }
    return {}
}
exports.getDocumentTemplate = getDocumentTemplate
function getLanguageServiceSSM(params) {
    let languageService
    const languageServiceJSON = exports.getLanguageServiceSSMJSON(params)
    const languageServiceYAML = exports.getLanguageServiceSSMYAML(
        params.schemaRequestService,
        params.workspaceContext,
        params.contributions,
        params.promiseConstructor
    )
    languageService = {
        configure: function(settings) {
            languageServiceJSON.configure({
                validate: settings.validate,
                allowComments: settings.allowComments,
                schemas: settings.schemas,
            })
            languageServiceYAML.configure({
                validate: settings.validate,
                hover: settings.hover,
                completion: settings.completion,
                schemas: settings.schemas,
            })
        },
        doValidation: (document, jsonDocument, documentSettings, schema) =>
            __awaiter(this, void 0, void 0, function*() {
                if (document.languageId === 'ssm-json') {
                    return yield languageServiceJSON.doValidation(document, jsonDocument, documentSettings, schema)
                }
                return yield languageServiceYAML.doValidation(document, false)
            }),
        doComplete: (document, position, jsonDocument) =>
            __awaiter(this, void 0, void 0, function*() {
                if (document.languageId === 'ssm-json') {
                    return yield languageServiceJSON.doComplete(document, position, jsonDocument)
                }
                return yield languageServiceYAML.doComplete(document, position, false)
            }),
        doResolve: item =>
            __awaiter(this, void 0, void 0, function*() {
                const jsonResult = yield languageServiceJSON.doResolve(item)
                if (!jsonResult.label && jsonResult !== item) {
                    return jsonResult
                }
                const yamlResult = yield languageServiceYAML.doResolve(item)
                return yamlResult
            }),
        doHover: (document, position, jsonDocument) =>
            __awaiter(this, void 0, void 0, function*() {
                if (document.languageId === 'ssm-json') {
                    return yield languageServiceJSON.doHover(document, position, jsonDocument)
                }
                return yield languageServiceYAML.doHover(document, position)
            }),
        findDocumentSymbols: (document, jsonDocument, context) => {
            if (document.languageId === 'ssm-json') {
                return languageServiceJSON.findDocumentSymbols(document, jsonDocument, context)
            }
            return languageServiceYAML.findDocumentSymbols(document)
        },
        findDocumentSymbols2: (document, jsonDocument, context) => {
            if (document.languageId === 'ssm-json') {
                return languageServiceJSON.findDocumentSymbols2(document, jsonDocument, context)
            }
            return languageServiceYAML.findDocumentSymbols2(document)
        },
        format: (document, range, options) => {
            if (document.languageId === 'ssm-json') {
                return languageServiceJSON.format(document, range, options)
            }
            return languageServiceYAML.doFormat(document, {})
        },
        findDocumentColors: (document, doc, context) =>
            __awaiter(this, void 0, void 0, function*() {
                return yield languageServiceJSON.findDocumentColors(document, doc, context)
            }),
        getColorPresentations: (document, doc, color, range) => {
            return languageServiceJSON.getColorPresentations(document, doc, color, range)
        },
        getFoldingRanges: (document, context) => {
            return languageServiceJSON.getFoldingRanges(document, context)
        },
        getSelectionRanges: (document, positions, doc) => {
            return languageServiceJSON.getSelectionRanges(document, positions, doc)
        },
        resetSchema: uri => {
            const jsonResult = languageServiceJSON.resetSchema(uri)
            const yamlResult = languageServiceYAML.resetSchema(uri)
            return jsonResult || yamlResult
        },
        parseJSONDocument: document => {
            if (document.languageId === 'ssm-json') {
                // tslint:disable-next-line: no-inferred-empty-object-type
                return languageServiceJSON.parseJSONDocument(document)
            }
            return yamlParser07_1.parse(document.getText()).documents[0]
        },
    }
    return languageService
}
exports.getLanguageServiceSSM = getLanguageServiceSSM
function getYAMLSnippets() {
    const allSnippets = new Map()
    parameterObject_json_1.default.definitions.additionalProperties.defaultSnippets.forEach(item => {
        allSnippets.set(item.label, YAML.stringify(item.body))
    })
    automationSnippets_json_1.default.definitions['0.3'].defaultSnippets.forEach(item => {
        allSnippets.set(item.label, YAML.stringify(item.body))
    })
    commandSnippets_json_1.default.definitions['2.2'].defaultSnippets.forEach(item => {
        allSnippets.set(item.label, YAML.stringify(item.body))
    })
    return allSnippets
}
exports.getLanguageServiceSSMYAML = (schemaRequestService, workspaceContext, contributions, promiseConstructor) => {
    const languageService = yaml_language_server_1.getLanguageService(
        schemaRequestService,
        workspaceContext,
        contributions,
        promiseConstructor
    )
    languageService.configure({
        validate: true,
        hover: true,
        completion: true,
        schemas: [
            {
                fileMatch: ['*'],
                schema: ssmdocschema_json_1.default,
                uri: 'file://' + path_1.join(__dirname, 'json-schema', 'ssmdocschema.json'),
            },
        ],
    })
    const allSnippets = getYAMLSnippets()
    const doValidation = languageService.doValidation.bind(languageService)
    const doComplete = languageService.doComplete.bind(languageService)
    languageService.doValidation = document =>
        __awaiter(void 0, void 0, void 0, function*() {
            // vscode-json-languageservice will always set severity as warning for JSONSchema validation
            // there is no option to configure this behavior so severity needs to be overwritten as error
            let diagnostics = (yield doValidation(document, false)).map(diagnostic => {
                diagnostic.severity = JsonLS.DiagnosticSeverity.Error
                return diagnostic
            })
            diagnostics = diagnostics.concat(validate_1.validate(document))
            diagnostics.forEach(diagnostic => {
                diagnostic.source = 'AWS Toolkit (Extension).'
            })
            return diagnostics
        })
    languageService.doComplete = (document, position, doc) =>
        __awaiter(void 0, void 0, void 0, function*() {
            const completionList = yield doComplete(document, position, false)
            completionList.items = complete_1.getYAMLActionSnippetsCompletion(allSnippets, completionList.items)
            completionList.items = completionList.items.concat(complete_1.complete(document, position, doc))
            completionList.items.sort((a, b) => {
                return a.kind - b.kind
            })
            return completionList
        })
    return languageService
}
exports.getLanguageServiceSSMJSON = params => {
    const buildInParams = {}
    const languageService = JsonLS.getLanguageService(Object.assign(Object.assign({}, params), buildInParams))
    const doValidation = languageService.doValidation.bind(languageService)
    const doComplete = languageService.doComplete.bind(languageService)
    languageService.configure({
        validate: true,
        allowComments: false,
        schemas: [
            {
                uri: 'file://' + path_1.join(__dirname, 'json-schema', 'ssmdocschema.json'),
                fileMatch: ['*'],
                schema: ssmdocschema_json_1.default,
            },
        ],
    })
    languageService.doValidation = (document, jsonDocument, documentSettings) =>
        __awaiter(void 0, void 0, void 0, function*() {
            // vscode-json-languageservice will always set severity as warning for JSONSchema validation
            // there is no option to configure this behavior so severity needs to be overwritten as error
            let diagnostics = (yield doValidation(document, jsonDocument, documentSettings)).map(diagnostic => {
                diagnostic.severity = JsonLS.DiagnosticSeverity.Error
                return diagnostic
            })
            diagnostics = diagnostics.concat(validate_1.validate(document))
            diagnostics.forEach(diagnostic => {
                diagnostic.source = 'AWS Toolkit (Extension).'
            })
            return diagnostics
        })
    languageService.doComplete = (document, position, doc) =>
        __awaiter(void 0, void 0, void 0, function*() {
            const completionList = yield doComplete(document, position, doc)
            completionList.items = completionList.items.concat(complete_1.complete(document, position, doc))
            completionList.items.sort((a, b) => {
                return a.kind - b.kind
            })
            return completionList
        })
    return languageService
}
//# sourceMappingURL=service.js.map
