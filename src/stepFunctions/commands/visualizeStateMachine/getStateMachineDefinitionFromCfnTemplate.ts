/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import { getLogger, Logger } from '../../../shared/logger'

/**
 * @param {string} uniqueIdentifier - unique identifier of state machine
 * @param {string} templatePath - path for the template.json file
 * 
 * @returns the escaped ASL Json definition string of the state machine construct
 */
export function getStateMachineDefinitionFromCfnTemplate(uniqueIdentifier: string, templatePath: string) {
    const logger: Logger = getLogger()
    try {
        let data = fs.readFileSync(templatePath, 'utf8')
        const jsonObj = JSON.parse(data)
        const resources = jsonObj.Resources

        for (const key of Object.keys(resources)) {
            if (key === 'CDKMetadata') continue

            const slicedKey = key.slice(0, -8)
            if (slicedKey === uniqueIdentifier) {
                const definitionString = jsonObj.Resources[`${key}`].Properties.DefinitionString
                data = JSON.stringify(definitionString)
                return data
            }
        }
        return
    }
    catch (err) {
        logger.debug('Unable to extract state machine definition string from template.json file.')
        logger.error(err as Error)
    }
}

/**
 * @param {string} escapedAslJsonStr - json state machine construct definition 
 * @returns unescaped json state machine construct definition
 */
export function toUnescapedAslJsonString(escapedAslJsonStr: string) {
    if (typeof (escapedAslJsonStr) != "string") return escapedAslJsonStr;

    const fnJoinPrefix = '{"Fn::Join":["",['
    const fnJoinSuffix = ']]}'
    const refRegExp = /(,{"Ref":)(.*?)(},")(.*?)(")/g //ARN of state machine followed by pseudo parameter
    const refRegExp2 = /(,{"Ref":)(.*?)(},"")/g //ARN of state machine
    const fnGetAttRegExp = /(,{"Fn::GetAtt")(.*?)(]},")(.*?)(")/g //value for a specified attribute of this type followed by pseudo parameter
    const fnGetAttRegExp2 = /(,{"Fn::GetAtt")(.*?)(]},"")/g //value for a specified attribute of this type

    return escapedAslJsonStr
        .trim() //remove leading whitespaces
        .replace(fnJoinPrefix, '')
        .replace(fnJoinSuffix, '')
        .trim() //remove leading whitespaces
        .substring(1) //remove the quotes that wrap escapedAslJsonStr
        .slice(0, -1) //remove the quotes that wrap escapedAslJsonStr
        .replace(/\\/g, '') //remove backslashes
        .replace(refRegExp, '')
        .replace(refRegExp2, '')
        .replace(fnGetAttRegExp, '')
        .replace(fnGetAttRegExp2, '')
}

export function toUnescapedAslJson(arg0: string): string | undefined {
    throw new Error('Function not implemented.')
}