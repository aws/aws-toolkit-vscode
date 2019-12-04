// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.rules

import org.junit.rules.ExternalResource
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.CreateServiceRequest
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.ecs.model.ServiceNotFoundException
import software.aws.toolkits.core.utils.RuleUtils

class ECSTemporaryServiceRule(val ecsClient: EcsClient) : ExternalResource() {
    private val services = mutableListOf<Service>()

    /**
     * Creates a temporary service. A random name with the generated prefix will be generated if a name is not provided in the request.
     */
    fun createService(prefix: String = RuleUtils.prefixFromCallingClass(), serviceBuilder: (CreateServiceRequest.Builder) -> Unit): Service {
        val service = ecsClient.createService {
            it.serviceName(RuleUtils.randomName(prefix))
            serviceBuilder(it)
        }.service()

        services.add(service)
        return service
    }

    override fun after() {
        val exceptions = services.mapNotNull { service ->
            val clusterArn = service.clusterArn()
            val serviceArn = service.serviceArn()
            deleteService(clusterArn, serviceArn)
        }
        if (exceptions.isNotEmpty()) {
            throw RuntimeException("Failed to delete all services. \n\t- ${exceptions.map { it.message }.joinToString("\n\t- ")}")
        }
    }

    private fun deleteService(cluster: String, service: String): Exception? = try {
        ecsClient.deleteService {
            it.cluster(cluster)
            it.service(service)
            it.force(true)
        }
        null
    } catch (e: Exception) {
        when (e) {
            is ServiceNotFoundException -> null
            else -> RuntimeException("Failed to delete service: $service - ${e.message}", e)
        }
    }
}
