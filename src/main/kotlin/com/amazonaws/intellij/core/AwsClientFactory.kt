package com.amazonaws.intellij.core

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.client.builder.AwsSyncClientBuilder
import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.AWSLambdaClientBuilder
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import java.util.concurrent.ConcurrentHashMap

class AwsClientFactory private constructor(private val credentialsProvider: AWSCredentialsProvider) {
    companion object {
        private val serviceClientBuilder = mapOf<String, AwsSyncClientBuilder<*, *>>(
                AmazonS3.ENDPOINT_PREFIX to AmazonS3ClientBuilder.standard(),
                AWSLambda.ENDPOINT_PREFIX to AWSLambdaClientBuilder.standard()
        //TODO more clients go here
        )
        private val accountFactory = ConcurrentHashMap<String, AwsClientFactory>()

        fun getClientFactory(profileName: String): AwsClientFactory =
                //TODO Credentials provider should be returned from a higher level API, the underlying profile might not be a standard AWS profile, it could be an odin or something else.
            accountFactory.getOrPut(profileName, { AwsClientFactory(ProfileCredentialsProvider(profileName)) })
    }
    private val cachedClients = CachedClients()

    fun getS3Client(regionId: String): AmazonS3 {
        return getClient(AmazonS3.ENDPOINT_PREFIX, regionId) as AmazonS3
    }

    fun getLambdaClient(regionId: String): AWSLambda {
        return getClient(AWSLambda.ENDPOINT_PREFIX, regionId) as AWSLambda
    }

    private fun getClient(serviceId: String, regionId: String): Any {
        synchronized(this) {
            return cachedClients.getClient(serviceId, regionId)
        }
    }

    private fun createClientByRegion(builder: AwsSyncClientBuilder<*, *>, region: String): Any {
        return builder.withCredentials(credentialsProvider)
                .withRegion(region)
                .build()
    }

    private inner class CachedClients() {
        private val cachedClients = ConcurrentHashMap<String, MutableMap<String, Any>>()

        fun cacheClient(serviceId: String, regionId: String, client: Any) {
            synchronized(this) {
                cachedClients.getOrPut(serviceId, { mutableMapOf() }).put(regionId, client)
            }
        }

        fun getClient(serviceId: String, regionId: String): Any {
            synchronized(this) {
                val cachedClient = cachedClients[serviceId]?.get(regionId)
                return if (cachedClient == null) {
                    val client = createClientByRegion(serviceClientBuilder[serviceId]!!, regionId)
                    cacheClient(serviceId, regionId, client)
                    client
                } else {
                    cachedClient
                }
            }
        }
    }
}