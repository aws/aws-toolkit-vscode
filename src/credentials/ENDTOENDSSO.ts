// THIS IS ONLY A WORKBENCH TO FOR POC PURPOSES (SSO)
import * as AWS from 'aws-sdk'
import { Logger } from '../../src/shared/logger/logger'
import { DiskCache } from './sso/diskCache'
import { SsoAccessTokenProvider } from './sso/ssoAccessTokenProvider'
import { SsoCredentialProvider } from './providers/ssoCredentialProvider'

const profile = {
    sso_start_url: '',
    sso_region: 'us-west-2',
    sso_role_name: '',
    sso_account_id: '',
}

export async function endToEndSSO(logger: Logger) {
    logger.info(`--------------------------starting workbench-----------------`)
    logger.info(`--------------------------register client--------------------`)
    const sso_oidc_client = new AWS.SSOOIDC({ region: profile.sso_region })
    const sso_client = new AWS.SSO({ region: profile.sso_region })
    const diskCache = new DiskCache()

    const ssoAccessTokenProvider = new SsoAccessTokenProvider(
        profile.sso_region,
        profile.sso_start_url,
        sso_oidc_client,
        diskCache
    )

    const ssoCredProvider = new SsoCredentialProvider(
        profile.sso_account_id,
        profile.sso_role_name,
        sso_client,
        ssoAccessTokenProvider
    )

    return await ssoCredProvider.refreshCredentials()
    // const accessToken = await ssoAccessTokenProvider.accessToken()

    // const regParams = {
    //     clientName: `toolkit-testing-${Date.now()}`,
    //     clientType: 'public'
    // }

    // let registerResponse = await sso_oidc_client.registerClient(regParams).promise()
    // logger.info(JSON.stringify(registerResponse))

    // const correctedExpiredDate = new Date(registerResponse.clientSecretExpiresAt!).toISOString()
    // logger.info(`------correctedExpiredDate -> ${correctedExpiredDate}--------`)

    // let clientRegistration: ClientRegistration = {
    //     clientId: registerResponse.clientId!,
    //     clientSecret: registerResponse.clientSecret!,
    //     expiresAt: correctedExpiredDate
    // }
    // logger.info(JSON.stringify(clientRegistration))

    // // Store client registration
    // diskCache.saveClientRegistration(profile.sso_region, clientRegistration)

    // // Start device authorization
    // const authorizationParams = {
    //     clientId: clientRegistration.clientId!,
    //     clientSecret: clientRegistration.clientSecret!,
    //     startUrl: profile.sso_start_url
    // }
    // const authorization = await sso_oidc_client.startDeviceAuthorization(authorizationParams).promise()

    // // logger.info("-------HERE IS THE AUTH OBJECT++++++++++++++++" + JSON.stringify(authorization))
    // // NO, DO NOT CACHE

    // const signInInstructionMessage = `User Code: ${authorization.userCode}\nVerificationUri: ${authorization.verificationUri}\nVerificationComplete: ${authorization.verificationUriComplete}\n\nUsing a browser, visit: ${authorization.verificationUri}\n\nAnd enter the code: ${authorization.userCode}`
    // await vscode.window.showInformationMessage(signInInstructionMessage)

    // // Need onPendingAuthorization?

    // // Start polling for access token

    // let interval = 4
    // const createTokenParams = {
    //     clientId: clientRegistration.clientId!,
    //     clientSecret: clientRegistration.clientSecret!,
    //     grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    //     deviceCode: authorization.deviceCode!
    // }
    // logger.info("TOKEN PARAMETERS -------" + JSON.stringify(createTokenParams))

    // let tokenResponse, accessToken: AccessToken
    // while (true) {
    //     logger.info(`TRYING TO CREATE TOKEN`)
    //     try {
    //         tokenResponse = await sso_oidc_client.createToken(createTokenParams).promise()
    //         logger.info(JSON.stringify(tokenResponse))
    //         accessToken = {
    //             startUrl: profile.sso_start_url,
    //             region: profile.sso_region,
    //             accessToken: tokenResponse.accessToken!,
    //             expiresAt: new Date((Date.now() + (tokenResponse.expiresIn! * 1000))).toISOString()

    //         }

    //         //logger.info(`TRYING TO ENCODE TOKEN AND CACHE`)
    //         //fs.writeFileSync(join(homedir(), '.aws', 'sso', 'cache', `FRUST2.json`), JSON.stringify(accessToken))
    //        break
    //     } catch (err) {
    //         logger.info(err)
    //     }

    //     setInterval(() => {}, interval * 1000)
    // }

    // diskCache.saveAccessToken(profile.sso_start_url, accessToken)

    // const sso_client = new AWS.SSO({ region: profile.sso_region })
    // const awsCreds = await sso_client
    //     .getRoleCredentials({
    //         accountId: profile.sso_account_id.toString(),
    //         roleName: profile.sso_role_name,
    //         accessToken: accessToken.accessToken!,
    //     })
    //     .promise()
    // logger.info(`NEW AWS CREDS`)
    // logger.info(JSON.stringify(awsCreds))

    // const creds = new AWS.Credentials({
    //     accessKeyId: awsCreds.roleCredentials?.accessKeyId!,
    //     secretAccessKey: awsCreds.roleCredentials?.secretAccessKey!,
    //     sessionToken: awsCreds.roleCredentials?.sessionToken,
    // })
    // logger.info(JSON.stringify(creds))
    // return creds

    // return () => creds
}
