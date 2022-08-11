// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.rules

import org.junit.rules.ExternalResource
import software.amazon.awssdk.services.ecr.EcrClient
import software.amazon.awssdk.services.ecr.model.Repository
import software.amazon.awssdk.services.ecr.model.RepositoryNotFoundException
import software.aws.toolkits.core.utils.RuleUtils

class EcrTemporaryRepositoryRule(private val ecrClientSupplier: () -> EcrClient) : ExternalResource() {
    constructor(ecrClient: EcrClient) : this({ ecrClient })

    private val repositories = mutableListOf<String>()

    /**
     * Creates a temporary repository with the optional prefix (or calling class if prefix is omitted)
     */
    fun createRepository(prefix: String = RuleUtils.prefixFromCallingClass()): Repository {
        val repositoryName: String = RuleUtils.randomName(prefix).lowercase()
        val client = ecrClientSupplier()

        // note there is no waiter for this
        val repo = client.createRepository { it.repositoryName(repositoryName) }

        repositories.add(repositoryName)

        return repo.repository()
    }

    override fun after() {
        val exceptions = repositories.mapNotNull { deleteRepository(it) }
        if (exceptions.isNotEmpty()) {
            throw RuntimeException("Failed to delete all repositories. \n\t- ${exceptions.map { it.message }.joinToString("\n\t- ")}")
        }
    }

    private fun deleteRepository(repository: String): Exception? = try {
        ecrClientSupplier().deleteRepository { it.repositoryName(repository).force(true) }
        null
    } catch (e: Exception) {
        when (e) {
            is RepositoryNotFoundException -> null
            else -> RuntimeException("Failed to delete repository: $repository - ${e.message}", e)
        }
    }
}
