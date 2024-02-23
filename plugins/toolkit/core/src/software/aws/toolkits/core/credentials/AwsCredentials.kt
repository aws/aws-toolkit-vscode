// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.core.SdkSystemSetting

private val CREDENTIAL_ENVIRONMENT_VARIABLES = setOf(
    SdkSystemSetting.AWS_ACCESS_KEY_ID.environmentVariable(),
    SdkSystemSetting.AWS_SECRET_ACCESS_KEY.environmentVariable(),
    SdkSystemSetting.AWS_SESSION_TOKEN.environmentVariable()
)

fun AwsCredentials.toEnvironmentVariables(): Map<String, String> {
    val map = mutableMapOf<String, String>()
    map[SdkSystemSetting.AWS_ACCESS_KEY_ID.environmentVariable()] = this.accessKeyId()
    map[SdkSystemSetting.AWS_SECRET_ACCESS_KEY.environmentVariable()] = this.secretAccessKey()

    if (this is AwsSessionCredentials) {
        map[SdkSystemSetting.AWS_SESSION_TOKEN.environmentVariable()] = this.sessionToken()
    }

    return map
}

fun AwsCredentials.mergeWithExistingEnvironmentVariables(existing: MutableMap<String, String>, replace: Boolean = false) {
    mergeWithExistingEnvironmentVariables(existing.keys, existing::remove, existing::putAll, replace)
}

fun AwsCredentials.mergeWithExistingEnvironmentVariables(
    existingKeys: Collection<String>,
    removeKey: (String) -> Unit,
    putValues: (Map<String, String>) -> Unit,
    replace: Boolean = false
) {
    val envVars = toEnvironmentVariables()
    if (replace || existingKeys.none { it in CREDENTIAL_ENVIRONMENT_VARIABLES }) {
        CREDENTIAL_ENVIRONMENT_VARIABLES.forEach { removeKey(it) }
        putValues(envVars)
    }
}
