package com.amazonaws.intellij.aws

import com.amazonaws.services.identitymanagement.AmazonIdentityManagement
import com.amazonaws.services.identitymanagement.AmazonIdentityManagementClientBuilder
import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.AWSLambdaClientBuilder
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3Client
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentHashMap

object AwsResourceManager {
    private val bundlesByProject = ConcurrentHashMap<Project, AwsResourceBundle>()

    fun getInstance(project: Project): AwsResourceBundle {
        return bundlesByProject.getOrPut(project, ::AwsResourceBundle)
    }
}

class AwsResourceBundle internal constructor() : S3ClientProvider, LambdaClientProvider, IamClientProvider {

    @Volatile private var resources = AwsResources("us-east-1")

    private val regionUpdatedListenerRegistry = mutableSetOf<RegionUpdatedListener>()

    fun updateRegion(newRegion: String) {
        resources = AwsResources(newRegion)
        regionUpdatedListenerRegistry.forEach { it.regionUpdated() }
    }

    fun registerRegionUpdatedListener(listener: RegionUpdatedListener) {
        regionUpdatedListenerRegistry.add(listener)
    }

    override fun s3Client(): AmazonS3 = resources.s3Client
    override fun lambdaClient(): AWSLambda = resources.lambdaClient
    override fun iamClient(): AmazonIdentityManagement = resources.iamClient;
    fun region(): String = resources.region
}

private class AwsResources(val region: String) {
    val s3Client: AmazonS3 = AmazonS3Client() //AmazonS3ClientBuilder.standard().withRegion(region).parse()
    val lambdaClient: AWSLambda = AWSLambdaClientBuilder.standard().withRegion(region).build()
    val iamClient: AmazonIdentityManagement = AmazonIdentityManagementClientBuilder.standard().withRegion(region).build()
}

interface RegionUpdatedListener {
    fun regionUpdated()
}

interface S3ClientProvider {
    fun s3Client(): AmazonS3
}

interface LambdaClientProvider {
    fun lambdaClient(): AWSLambda
}

interface IamClientProvider {
    fun iamClient(): AmazonIdentityManagement
}