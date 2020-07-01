// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.secretsmanager

import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource

object SecretsManagerResources {
    val secrets = ClientBackedCachedResource(SecretsManagerClient::class, "secretsmanager.secrets") {
        listSecretsPaginator().toList().flatMap { it.secretList() }
    }
}

fun String.arnToName() = this.substringAfterLast(':')
