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
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const yamlParser07_1 = require('yaml-language-server/out/server/src/languageservice/parser/yamlParser07')
const ast = __importStar(require('../util/astFunctions'))
const util_1 = require('./util')
/*
const text = `{
    "schemaVersion": "2.2",
    "mainSteps": [
        $
    ],
    "parameters": {
        $
    },
    "assumeRole": "sdf"
}`
const { textDoc, jsonDoc } = toDocument(text, 'json', 'command')
const rootNode = (jsonDoc as ast.ASTTree).root

const pos1: Position = Position.create(3, 8)
const offset1: number = textDoc.offsetAt(pos1)
const node1 = ast.findNodeAtLocation(rootNode, offset1)
console.log(node1)
console.log(ast.suggestActions(node1, '2.2'))

const pos2: Position = Position.create(6, 8)
const offset2: number = textDoc.offsetAt(pos2)
const node2 = ast.findNodeAtLocation(rootNode, offset2)
console.log(node2)
console.log(ast.suggestParameters(node2))
const greatGrandParentNode = node2.parent?.parent?.parent
console.log(!greatGrandParentNode.parent?.parent)

*/
function getNode(docText, row, char, ext, type) {
    const pos = vscode_json_languageservice_1.Position.create(row, char)
    const doc = util_1.toDocument(docText, ext, type)
    if (ext === 'yaml') {
        doc.jsonDoc = yamlParser07_1.parse(docText).documents[0]
    }
    const rootNode = doc.jsonDoc.root
    const offset = doc.textDoc.offsetAt(pos)
    //console.log(rootNode)
    //console.log(offset)
    return {
        node: ast.findCurrentNodeHelper(rootNode, offset),
        offset: offset,
    }
}
const text = `{
    "schemaVersion": "2.2",
    "parameters": {
        s
    },
    "mainSteps": [
        {
            "action": "aws:applications",
            "name": "exampleApplications",
            "inputs": {
                "action": "Install",
                "source": "{{ source }}",
                "sourceHash": "{{ sourceHash }}
            }
        }
    ]
}`
const n = getNode(text, 3, 9, 'json', 'command')
console.log(n)
console.log(n.node.parent.parent.parent.keyNode.value)
const text2 = `{
    "schemaVersion": "2.2",
    "parameters": {
        "param":
    }
}`
const n2 = getNode(text2, 3, 16, 'json', 'command')
console.log(n2)
console.log(n2.node.parent.parent.keyNode.value)
const yamlText2 = `---
schemaVersion: '2.2'
description: Example document description
parameters:
  param1:
    type: Boolean
    description: (Required) Description for this parameter.
    default: true
  e:
    type: Boolean
    description: (Required) Description for this parameter.
    default: true
mainSteps:
  - action: example action
    name: example
    inputs:
      example input:
        - '{{ example }}'
`
/*
const yamlNode2 = getNode(yamlText2, 8, 3, 'yaml', 'command')
console.log(yamlNode2)
console.log(ast.suggestParameterNames(yamlNode2.node, yamlNode2.offset))

const temp = JSON.stringify(parameterObject.definitions.additionalProperties.defaultSnippets[0])
console.log(temp)
parameterObject.definitions.additionalProperties.defaultSnippets.forEach(snippet => {
    const str = JSON.stringify(snippet.body, undefined, '\t')
    let stringList = str.split('\n')
    stringList = stringList.slice(1, stringList.length - 1)
    stringList = stringList.map(item => {
        return item.substr(1)
    })
    stringList.forEach(item => {
        console.log(item)
    })
})
*/
//# sourceMappingURL=testAST.test.js.map
