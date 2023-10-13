/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../shared/logger/logger'
import type { LocalResolvedConfig } from './types'
import globals from '../shared/extensionGlobals'

export const getConfig: () => Promise<LocalResolvedConfig> = async () => {
    const appConfigFormatVersion = 2
    const config = process.env.WEAVERBIRD_CONFIG

    const lambdaFunctionNames = {
        approach: {
            generate: 'GenerateApproachLambda:live',
            iterate: 'IterateApproachLambda:live',
        },
        codegen: {
            generate: 'GenerateCodeLambda:live',
            iterate: 'IterateCodeLambda:live',
            getResults: 'GetCodeGenerationResultLambda:live',
            getIterationResults: 'GetCodeIterationResultLambda:live',
        },
    }
    const getLambdaArns = (env: { account: string; region: string }) => ({
        approach: {
            generate: `arn:aws:lambda:${env.region}:${env.account}:function:${lambdaFunctionNames.approach.generate}`,
            iterate: `arn:aws:lambda:${env.region}:${env.account}:function:${lambdaFunctionNames.approach.iterate}`,
        },
        codegen: {
            generate: `arn:aws:lambda:${env.region}:${env.account}:function:${lambdaFunctionNames.codegen.generate}`,
            iterate: `arn:aws:lambda:${env.region}:${env.account}:function:${lambdaFunctionNames.codegen.iterate}`,
            getResults: `arn:aws:lambda:${env.region}:${env.account}:function:${lambdaFunctionNames.codegen.getResults}`,
            getIterationResults: `arn:aws:lambda:${env.region}:${env.account}:function:${lambdaFunctionNames.codegen.getResults}`,
        },
    })

    const GAMMA = '789621683470'
    const gammaEnv = { account: GAMMA, region: 'us-east-1' }
    const gammaConfig = {
        endpoint: 'https://80u08f1ec9.execute-api.us-east-1.amazonaws.com/gamma',
        region: gammaEnv.region,
        lambdaArns: getLambdaArns(gammaEnv),
    }

    const accountOverride = process.env.WEAVERBIRD_ACCOUNT_OVERRIDE

    const defaultConfig =
        (accountOverride ?? '') === ''
            ? gammaConfig
            : accountOverride === 'fromCredentials'
            ? {
                  // currently we invoke the lambdas directly, so we dont use this
                  endpoint: 'https://invalid.url.com/gamma',
                  region: globals.awsContext.getCredentialDefaultRegion(),
                  lambdaArns: lambdaFunctionNames,
              }
            : (() => {
                  const config = JSON.parse(accountOverride ?? '') as typeof gammaEnv
                  return {
                      // currently we invoke the lambdas directly, so we dont use this
                      endpoint: 'https://invalid.url.com/gamma',
                      region: config.region,
                      lambdaArns: getLambdaArns(config),
                  }
              })()
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
                    getIterationResults: parsedConfig.lambdaArns?.codegen?.getIterationResults as string,
                },
            },
        }
    } catch (e) {
        return defaultConfig
    }
}
