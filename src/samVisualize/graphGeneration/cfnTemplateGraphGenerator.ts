/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Graph, GraphObject } from './graph'
import { yamlParse } from 'yaml-cfn'
import { TemplateLinkTypes } from '../samVisualizeTypes'
import * as _ from 'lodash'
import { getLogger } from '../../shared/logger/logger'

/**
 * @param inputYaml A string representing a YAML template
 * @returns A JavaScript object corresponding to the given YAML string, or undefined if the input is not valid YAML
 */
function yamlStringToObject(inputYaml: string, filePathForErr: string): Record<string, any> | undefined {
    try {
        return yamlParse(inputYaml)
    } catch (err) {
        getLogger().error(`Failed to load CloudFormation template [${filePathForErr}]: ${err} `)
    }
}

/**
 * @description Takes a string with embedded resource names within `${}`, and extracts each resource.
 * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-sub.html#w2ab1c33c28c59c11b6
 * @example 'xxx${resource1}yyyzzz${resource2}abc' => ['resource1', 'resource2']
 * @param value A string containing embedded resources
 * @returns A list of strings corresponding to the embedded resource names. If no resource names are found, returns an empty list.
 */
function extractSubstitution(value: string): Array<string> {
    // const names: Array<string> | null = value.match(/\${[^}]+}/g)
    // return names ? names.map((str: string) => str.replace(/(\$|}|{)/g, '')) : []
    const names = []
    const regex = /\${([^}]+)}/g
    let match = regex.exec(value)
    // Iterate to catch all possible matches
    while (match) {
        // The resource name is in the first capture group
        names.push(match[1])
        match = regex.exec(value)
    }
    return names
}

/**
 * Recursively traverses (DFS) an object representation of a yaml template resource, adding links to the graph where found
 * @param graph The Graph in which links are created. It is modified, due to traverse being recursive. But this Graph is not visible from outside the module, so there are no external side effects
 * @param currentObj The object wich is currently being searched for link keys
 * @param parentNodeName The name of the node representing the current parent node, which any found links will be added to.
 */
function traverse(graph: Graph, currentObj: Record<string, any>, parentNodeName: string): void {
    // Cannot traverse on a string or number literal, no links will be found.
    if (!_.isObjectLike(currentObj)) {
        return
    }
    for (const [key, value] of Object.entries(currentObj)) {
        switch (key) {
            //  "DepenedsOn" can point to a single string or a list of strings. Here we wish to capture all resources in a list, or just a single resource.
            //  https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-dependson.html
            case TemplateLinkTypes.DependsOn:
                if (Array.isArray(value)) {
                    for (const destNodeName of value) {
                        graph.createLink(parentNodeName, destNodeName, TemplateLinkTypes.DependsOn)
                    }
                } else {
                    graph.createLink(parentNodeName, value, TemplateLinkTypes.DependsOn)
                }
                break

            //  Once the YAML is parsed, a "GetAtt" key will point to an array with two elements.
            //  We only want the logicalNameOfResource, which lies in the first element of the tuple.
            //  https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html
            case TemplateLinkTypes.GetAtt:
                graph.createLink(parentNodeName, value[0], TemplateLinkTypes.GetAtt)
                break

            //  Adding a single link, from a "Ref" key
            //  https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-ref.html
            case TemplateLinkTypes.Ref:
                graph.createLink(parentNodeName, value, TemplateLinkTypes.Ref)
                break

            //  Extracting an link out of a substitution
            //  A sub link can point to an array, or a single string.
            //  We can immediately extract the substituion if it points to a string, otherwise we must continue traversing
            //  https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-sub.html
            case TemplateLinkTypes.Sub:
                if (_.isString(value)) {
                    const substitutions = extractSubstitution(value)
                    for (const destNodeName of substitutions) {
                        graph.createLink(parentNodeName, destNodeName, TemplateLinkTypes.Sub)
                    }
                } else {
                    // Key must point to an array
                    for (const element of value) {
                        traverse(graph, element, parentNodeName)
                    }
                }
                break
            //  If a key is not a possible link, we continue to traverse for nested links
            default:
                // If the value is an array, we traverse each traversable element
                if (Array.isArray(value)) {
                    for (const element of value) {
                        traverse(graph, element, parentNodeName)
                    }
                } else {
                    traverse(graph, value, parentNodeName)
                }
        }
    }
}
/**
 * Generates a graph of the resources contained in a CFN YAML template, provided the template adheres to the `Template Anatomy`
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
 * @param inputYaml A string representing a YAML template.
 * @returns A GraphObject representing the graph, or `undefined` if the input does adhere to the `Template Anatomy`
 */
export function generateGraphFromYaml(inputYaml: string, filePathForErr: string): GraphObject | undefined {
    const templateData = yamlStringToObject(inputYaml, filePathForErr)
    // A graph cannot be generated if the template data is not defined, or not an object
    if (templateData !== undefined && _.isObjectLike(templateData)) {
        // We only want Resources as nodes in the graph
        const resources = templateData['Resources']

        // If the input yaml does not have a 'Resources' key, no graph can be generated
        if (!_.isObjectLike(resources) || _.isArrayLike(resources)) {
            getLogger().error(
                `Error rendering CloudFormation template [${filePathForErr}]. Cannot render a template with a missing or invalid 'Resources' key.`
            )
            return undefined
        }

        const graph = new Graph()

        // Loop over each resource and initialize it in the map.
        // These are the only nodes we want to be working with, links to non-resources will be ignored.
        for (const resourceName of Object.keys(resources)) {
            // If a resource does not contain an object body, it cannot be defined in the graph
            if (!_.isObjectLike(resources[resourceName]) || _.isArrayLike(resources[resourceName])) {
                getLogger().error(
                    `Error rendering CloudFormation template [${filePathForErr}]. The '${resourceName}' resource definition is invalid.`
                )
                return undefined
            }
            if (!_.isString(resources[resourceName]['Type'])) {
                getLogger().error(
                    `Error rendering CloudFormation template [${filePathForErr}]. The '${resourceName}' has an missing or invalid Type.`
                )
                return undefined
            }
            graph.initNode(resourceName, resources[resourceName]['Type'])
        }
        // Now we can traverse each resource, after having defined each possible node in the map
        for (const resourceName of Object.keys(resources)) {
            traverse(graph, resources[resourceName], resourceName)
        }
        return graph.getObjectRepresentation()
    }
}
