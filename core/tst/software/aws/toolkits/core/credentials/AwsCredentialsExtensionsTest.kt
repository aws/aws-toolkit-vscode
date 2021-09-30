// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.utils.test.aString

class AwsCredentialsExtensionsTest {

    @Test
    fun `can convert basic credentials to environment variables`() {
        val credentials = AwsBasicCredentials.create(aString(), aString())
        assertThat(credentials.toEnvironmentVariables()).hasSize(2)
            .containsEntry("AWS_ACCESS_KEY_ID", credentials.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", credentials.secretAccessKey())
    }

    @Test
    fun `can convert session credentials to environment variables`() {
        val credentials = AwsSessionCredentials.create(aString(), aString(), aString())
        assertThat(credentials.toEnvironmentVariables()).hasSize(3)
            .containsEntry("AWS_ACCESS_KEY_ID", credentials.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", credentials.secretAccessKey())
            .containsEntry("AWS_SESSION_TOKEN", credentials.sessionToken())
    }

    @Test
    fun `can add environment variables to an existing env map`() {
        val credentials = AwsSessionCredentials.create(aString(), aString(), aString())
        val env = mutableMapOf<String, String>()

        credentials.mergeWithExistingEnvironmentVariables(env)

        assertThat(env).containsOnlyKeys("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN")
    }

    @Test
    fun `existing credentials are not replaced by default`() {
        val credentials = AwsBasicCredentials.create(aString(), aString())
        val existingToken = aString()
        val env = mutableMapOf("AWS_SESSION_TOKEN" to existingToken)

        credentials.mergeWithExistingEnvironmentVariables(env)

        assertThat(env).hasSize(1).containsEntry("AWS_SESSION_TOKEN", existingToken)
    }

    @Test
    fun `existing credentials can be replaced`() {
        val credentials = AwsBasicCredentials.create(aString(), aString())
        val existingToken = aString()
        val env = mutableMapOf("AWS_SESSION_TOKEN" to existingToken)

        credentials.mergeWithExistingEnvironmentVariables(env, replace = true)

        assertThat(env).hasSize(2)
            .containsEntry("AWS_ACCESS_KEY_ID", credentials.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", credentials.secretAccessKey())
    }
}
