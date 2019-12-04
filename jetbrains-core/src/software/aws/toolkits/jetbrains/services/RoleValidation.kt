// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

object RoleValidation {
    fun isRolePolicyValidForCloudDebug(rolePolicy: String): Boolean {
        val jsonPolicy = jacksonObjectMapper().readTree(rolePolicy)
        val validPolicyStatement = jsonPolicy["Statement"]?.firstOrNull {
            it["Effect"]?.textValue() == "Allow" &&
                it["Action"]?.textValue() == "sts:AssumeRole" &&
                serviceContainsEcsTasks(it["Principal"]?.get("Service"))
        }

        return validPolicyStatement != null
    }

    private fun serviceContainsEcsTasks(node: JsonNode?): Boolean {
        if (node == null) {
            return false
        }

        if (node.isArray) {
            return node.any { serviceContainsEcsTasks(it) }
        } else {
            return node.textValue() == "ecs-tasks.amazonaws.com"
        }
    }
}
