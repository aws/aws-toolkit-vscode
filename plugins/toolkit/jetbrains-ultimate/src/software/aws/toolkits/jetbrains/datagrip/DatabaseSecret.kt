// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.SecretListEntry
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerDbSecret
import software.aws.toolkits.jetbrains.services.rds.RdsNode
import software.aws.toolkits.jetbrains.services.redshift.RedshiftExplorerNode
import software.aws.toolkits.jetbrains.services.redshift.RedshiftResources.REDSHIFT_ENGINE_TYPE
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

object DatabaseSecret {
    private val objectMapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

    fun getSecret(project: Project, secret: SecretListEntry?): Pair<SecretsManagerDbSecret, String>? {
        secret ?: return null
        return try {
            val value = project.awsClient<SecretsManagerClient>().getSecretValue { it.secretId(secret.arn()) }
            val dbSecret = objectMapper.readValue<SecretsManagerDbSecret>(value.secretString())
            Pair(dbSecret, secret.arn())
        } catch (e: Exception) {
            notifyError(
                title = message("datagrip.secretsmanager.validation.failed_to_get", secret.name()),
                content = e.message ?: e.toString()
            )
            null
        }
    }

    fun validateSecret(node: AwsExplorerNode<*>, dbSecret: SecretsManagerDbSecret, secretName: String): ValidationInfo? {
        // Validate the secret has the bare minimum
        dbSecret.username ?: return ValidationInfo(message("datagrip.secretsmanager.validation.no_username", secretName))
        dbSecret.password ?: return ValidationInfo(message("datagrip.secretsmanager.validation.no_password", secretName))
        // If it is a resource node, validate that it is the same resource
        when (node) {
            is RdsNode -> {
                if (node.database.engine != dbSecret.engine) {
                    return ValidationInfo(
                        message(
                            "datagrip.secretsmanager.validation.different_engine",
                            secretName,
                            dbSecret.engine.toString()
                        )
                    )
                }
                if (node.database.endpoint.host != dbSecret.host) {
                    return ValidationInfo(
                        message("datagrip.secretsmanager.validation.different_address", secretName, dbSecret.host.toString())
                    )
                }
            }
            is RedshiftExplorerNode -> {
                if (dbSecret.engine != REDSHIFT_ENGINE_TYPE) {
                    return ValidationInfo(
                        message(
                            "datagrip.secretsmanager.validation.different_engine",
                            secretName,
                            dbSecret.engine.toString()
                        )
                    )
                }
                if (node.cluster.endpoint().address() != dbSecret.host) {
                    return ValidationInfo(
                        message("datagrip.secretsmanager.validation.different_address", secretName, dbSecret.host.toString())
                    )
                }
            }
        }
        return null
    }
}
