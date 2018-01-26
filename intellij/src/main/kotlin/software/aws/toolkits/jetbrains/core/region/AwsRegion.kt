package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

data class AwsRegion private constructor(val id: String, val name: String, val icon: Icon) {
    private companion object {
         val UNKNOWN_REGION_FLAG = "/icons/aws-box.gif"
         val REGION_FLAG_MAPPING = mapOf(
                 "us-east-1" to "/icons/flags/us.png",
                 "us-east-2" to "/icons/flags/us.png",
                 "us-west-1" to "/icons/flags/us.png",
                 "us-west-2" to "/icons/flags/us.png",
                 "ap-northeast-1" to "/icons/flags/japan.png",
                 "ap-southeast-1" to "/icons/flags/singapore.png",
                 "ap-southeast-2" to "/icons/flags/australia.png",
                 "eu-west-1" to "/icons/flags/ireland.png",
                 "eu-central-1" to "/icons/flags/eu.png",
                 "eu-west-2" to "/icons/flags/eu.png"
        )
    }

    constructor(id: String, name: String):
            this(id, name, IconLoader.getIcon (REGION_FLAG_MAPPING.getOrDefault(id, UNKNOWN_REGION_FLAG)))

    override fun toString(): String {
        return name
    }
}