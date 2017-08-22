package com.amazonaws.intellij.core

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.client.builder.AwsSyncClientBuilder
import com.amazonaws.intellij.credentials.AWSCredentialsProfileProvider
import com.amazonaws.services.codecommit.AWSCodeCommit
import com.amazonaws.services.codecommit.AWSCodeCommitClientBuilder
import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.AWSLambdaClientBuilder
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentHashMap

class AwsClientFactory(private val project: Project) {

    private data class AwsClientKey(val profileName: String, val regionId: String, val serviceId: String)

    companion object {
        private val serviceClientBuilder = mapOf<String, AwsSyncClientBuilder<*, *>>(
                AmazonS3.ENDPOINT_PREFIX to AmazonS3ClientBuilder.standard(),
                AWSLambda.ENDPOINT_PREFIX to AWSLambdaClientBuilder.standard(),
                AWSCodeCommit.ENDPOINT_PREFIX to AWSCodeCommitClientBuilder.standard()
                //TODO more clients go here
        )

        @JvmStatic
        fun getInstance(project: Project): AwsClientFactory {
            return ServiceManager.getService(project, AwsClientFactory::class.java)
        }
    }

    private val cachedClients = ConcurrentHashMap<AwsClientKey, Any>()

    fun getS3Client(profileName: String, regionId: String): AmazonS3 {
        return getClient(profileName, regionId, AmazonS3.ENDPOINT_PREFIX) as AmazonS3
    }

    fun getLambdaClient(profileName: String, regionId: String): AWSLambda {
        return getClient(profileName, regionId, AWSLambda.ENDPOINT_PREFIX) as AWSLambda
    }

    fun getCodeCommitClient(profileName: String, regionId: String): AWSCodeCommit {
        return getClient(profileName, regionId, AWSCodeCommit.ENDPOINT_PREFIX) as AWSCodeCommit
    }

    private fun getClient(profileName: String, regionId: String, serviceId: String): Any {
        val key = AwsClientKey(profileName, regionId, serviceId)
        return cachedClients.computeIfAbsent(key, { createClient(serviceClientBuilder[it.serviceId]!!, it.profileName, it.regionId) })
    }

    private fun createClient(builder: AwsSyncClientBuilder<*, *>, profileName: String, regionId: String): Any =
            builder.withCredentials(getCredentialsProvider(profileName))
                    .withRegion(regionId)
                    .build()

    private fun getCredentialsProvider(profileName: String): AWSCredentialsProvider {
        //TODO If we cannot find the profile name, we should report internal error
        return AWSCredentialsProfileProvider.getInstance(project).lookupProfileByName(profileName)!!.awsCredentials
    }
}