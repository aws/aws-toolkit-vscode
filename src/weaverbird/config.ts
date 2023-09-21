/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../shared/logger/logger'
import type { LocalResolvedConfig } from './types'

let cachedConfig: LocalResolvedConfig | undefined = undefined

export const getConfig: () => Promise<LocalResolvedConfig> = async () => {
    return (
        cachedConfig ??
        (cachedConfig = await (async () => {
            const appConfigFormatVersion = 2
            const config = process.env.WEAVERBIRD_CONFIG

            // const _betaConfig = {
            //     endpoint: 'https://pehp5nezwj.execute-api.us-west-2.amazonaws.com/beta',
            //     region: 'us-west-2',
            //     lambdaArns: {
            //         approach: {
            //             generate:
            //                 'arn:aws:lambda:us-west-2:740920811238:function:GenerateApproachLambda:live',
            //             iterate:
            //                 'arn:aws:lambda:us-west-2:740920811238:function:IterateApproachLambda:live',
            //         },
            //         codegen: {
            //             generate:
            //                 'arn:aws:lambda:us-west-2:740920811238:function:GenerateCodeLambda:live',
            //             iterate:
            //                 'arn:aws:lambda:us-west-2:740920811238:function:IterateCodeLambda:live',
            //             getResults:
            //                 'arn:aws:lambda:us-west-2:740920811238:function:GetCodeGenerationResultLambda:live',
            //         },
            //     },
            // }
            const gammaConfig = {
                endpoint: 'https://8id2rzphzj.execute-api.us-west-2.amazonaws.com/gamma',
                region: 'us-west-2',
                lambdaArns: {
                    approach: {
                        generate: 'arn:aws:lambda:us-west-2:789621683470:function:GenerateApproachLambda:live',
                        iterate: 'arn:aws:lambda:us-west-2:789621683470:function:IterateApproachLambda:live',
                    },
                    codegen: {
                        generate: 'arn:aws:lambda:us-west-2:789621683470:function:GenerateCodeLambda:live',
                        iterate: 'arn:aws:lambda:us-west-2:789621683470:function:IterateCodeLambda:live',
                        getResults: 'arn:aws:lambda:us-west-2:789621683470:function:GetCodeGenerationResultLambda:live',
                    },
                },
            }
            const defaultConfig = gammaConfig
            try {
                const parsedConfig = JSON.parse(config ?? `{ "version": ${appConfigFormatVersion}}`)
                const localConfigVersion = Number.parseInt(parsedConfig.version)
                if (isNaN(localConfigVersion) || localConfigVersion !== appConfigFormatVersion) {
                    const errorMessage = `Invalid config version, required ${appConfigFormatVersion}, found ${localConfigVersion}`
                    getLogger().error(errorMessage)
                    throw new Error(errorMessage)
                }
                return {
                    endpoint: (parsedConfig.endpoint as string) ?? defaultConfig.endpoint,
                    region: (parsedConfig.region as string) ?? defaultConfig.region,
                    lambdaArns: {
                        approach: {
                            generate:
                                (parsedConfig.lambdaArns?.approach?.generate as string) ??
                                defaultConfig.lambdaArns.approach.generate,
                            iterate:
                                (parsedConfig.lambdaArns?.approach?.iterate as string) ??
                                defaultConfig.lambdaArns.approach.iterate,
                        },
                        codegen: {
                            generate:
                                (parsedConfig.lambdaArns?.codegen?.generate as string) ??
                                defaultConfig.lambdaArns.codegen.generate,
                            iterate:
                                (parsedConfig.lambdaArns?.codegen?.iterate as string) ??
                                defaultConfig.lambdaArns.codegen.iterate,
                            getResults:
                                (parsedConfig.lambdaArns?.codegen?.getResults as string) ??
                                defaultConfig.lambdaArns.codegen.getResults,
                        },
                    },
                }
            } catch (e) {
                return defaultConfig
            }
        })())
    )
}
