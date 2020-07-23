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
Object.defineProperty(exports, '__esModule', { value: true })
exports.findRegPattern = exports.getVariableName = exports.parseDocument = exports.findSchemaVersion = exports.findDocumentType = void 0
const YAML = __importStar(require('yaml'))
function findDocumentType(document) {
    const uriSplitArr = document.uri.split('/')
    const filename = uriSplitArr[uriSplitArr.length - 1].toLocaleLowerCase()
    // filename should have format of *.<document type>.ssm.{json, yaml}
    const extSplitArr = filename.split('.')
    if (extSplitArr.length < 3) {
        return ''
    }
    return extSplitArr[extSplitArr.length - 3]
}
exports.findDocumentType = findDocumentType
function findSchemaVersion(docText) {
    const pos = docText.indexOf('schemaVersion')
    if (pos === -1) {
        return ''
    }
    const varPattern = /[0-9]\.[0-9]/g
    const match = varPattern.exec(docText.substr(pos))
    if (!match) {
        return ''
    }
    return match[0]
}
exports.findSchemaVersion = findSchemaVersion
function parseDocument(textDocument) {
    let obj
    if (textDocument.languageId === 'ssm-json') {
        obj = JSON.parse(textDocument.getText())
    } else {
        obj = YAML.parse(textDocument.getText())
    }
    return obj
}
exports.parseDocument = parseDocument
/** @param text string in the form of {{ VARIABLE }} */
function getVariableName(text) {
    const start = text.lastIndexOf('{') + 1
    const end = text.indexOf('}')
    return text.substring(start, end).trim()
}
exports.getVariableName = getVariableName
function findRegPattern(textDocument, pattern) {
    const docText = textDocument.getText()
    let vars = pattern.exec(docText)
    const result = []
    while (vars) {
        result.push({
            value: vars[0],
            start: textDocument.positionAt(vars.index),
            end: textDocument.positionAt(vars.index + vars[0].length),
        })
        vars = pattern.exec(docText)
    }
    return result
}
exports.findRegPattern = findRegPattern
//# sourceMappingURL=util.js.map
