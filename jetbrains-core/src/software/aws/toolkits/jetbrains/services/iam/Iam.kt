// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.Role
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.services.lambda.upload.LAMBDA_PRINCIPAL

data class IamRole(val arn: String) {
    override fun toString(): String = name ?: arn

    val name: String? by lazy {
        ARN_REGEX.matchEntire(arn)?.groups?.elementAtOrNull(1)?.value
    }

    companion object {
        private val ARN_REGEX = "arn:.+:iam::.+:role/(.+)".toRegex()
    }
}

object IamResources {

    val LIST_RAW_ROLES = ClientBackedCachedResource(IamClient::class, "iam.list_roles") {
        listRolesPaginator().roles().toList()
    }

    @JvmField
    val LIST_ALL: Resource<List<IamRole>> = Resource.View(LIST_RAW_ROLES) {
        map { IamRole(it.arn()) }.toList()
    }

    @JvmField
    val LIST_LAMBDA_ROLES: Resource<List<IamRole>> = Resource.View(LIST_RAW_ROLES) {
        filter { it.assumeRolePolicyDocument().contains(LAMBDA_PRINCIPAL) }
            .map { IamRole(it.arn()) }
            .toList()
    }
}

object Iam {
    private val LOG = getLogger<Iam>()

    fun IamClient.createRoleWithPolicy(roleName: String, assumeRolePolicy: String, policy: String? = null): Role {
        val role = this.createRole {
            it.roleName(roleName)
            it.assumeRolePolicyDocument(assumeRolePolicy)
        }.role()

        policy?.let {
            try {
                this.putRolePolicy {
                    it.roleName(roleName)
                        .policyName(roleName)
                        .policyDocument(policy)
                }
            } catch (exception: Exception) {
                try {
                    this.deleteRole {
                        it.roleName(role.roleName())
                    }
                } catch (deleteException: Exception) {
                    LOG.warn(deleteException) { "Failed to delete IAM role $roleName" }
                }
                throw exception
            }
        }

        return role
    }
}
