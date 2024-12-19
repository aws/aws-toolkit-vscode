/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import { getLogger, Logger } from '../../../shared/logger'

/**
 * @param {string} uniqueIdentifier - unique identifier of state machine
 * @param {string} templatePath - path for the template.json file
 *
 * @returns the escaped ASL Json definition string of the state machine construct
 */
export function getStateMachineDefinitionFromCfnTemplate(uniqueIdentifier: string, templatePath: string): string {
    const logger: Logger = getLogger()
    try {
        const data = fs.readFileSync(templatePath, 'utf8')
        const jsonObj = JSON.parse(data)
        const resources = jsonObj?.Resources
        if (!resources) {
            return ''
        }
        let matchingKey: string

        const matchingKeyList: string[] = []
        for (const key of Object.keys(resources)) {
            // the resources list always contains 'CDKMetadata'
            if (key === 'CDKMetadata') {
                continue
            }

            if (key.substring(0, uniqueIdentifier.length) === uniqueIdentifier) {
                matchingKeyList.push(key)
            }
        }
        if (matchingKeyList.length === 0) {
            return ''
        } else {
            // return minimum length key in matchingKeyList
            matchingKey = matchingKeyList.reduce((a, b) => (a.length <= b.length ? a : b))
        }

        const definitionString = jsonObj.Resources[matchingKey].Properties.DefinitionString

        return !definitionString ? '' : definitionString
    } catch (err) {
        logger.debug('Unable to extract state machine definition string from template.json file.')
        logger.error(err as Error)
        return ''
    }
}

/**
 * @param {string} escapedAslJsonStr - json state machine construct definition
 * @returns unescaped json state machine construct definition in asl.json
 */
export function toUnescapedAslJsonString(
    escapedAslJsonStr:
        | string
        | {
              'Fn::Join': any[] // eslint-disable-line @typescript-eslint/naming-convention
          }
): string {
    if (typeof escapedAslJsonStr === 'string') {
        return escapedAslJsonStr
    }

    const definitionStringWithPlaceholders: any[] = escapedAslJsonStr['Fn::Join'][1]
    const definitionStringSegments: string[] = definitionStringWithPlaceholders.filter(
        (segment) => typeof segment === 'string'
    )
    return definitionStringSegments.join('')
}
