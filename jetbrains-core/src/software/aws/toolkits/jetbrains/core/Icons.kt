package software.aws.toolkits.jetbrains.core

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.IconLoader
import com.intellij.ui.LayeredIcon

object Icons {
    @JvmField val AWS_ICON = IconLoader.getIcon("/icons/aws-box.gif")
    @JvmField val INFO_ICON = IconLoader.getIcon("/icons/information.png")
    @JvmField val ADD_ICON = IconLoader.getIcon("/icons/add.png")

    object Services {
        @JvmField val S3_BUCKET_ICON = IconLoader.getIcon("/icons/bucket.png")
        @JvmField val S3_SERVICE_ICON = IconLoader.getIcon("/icons/s3-service.png")
        @JvmField val LAMBDA_SERVICE_ICON = IconLoader.getIcon("/icons/lambda-service.png")
        @JvmField val LAMBDA_SERVICE_ICON_LARGE = IconLoader.getIcon("/icons/lambda-service-large.png")
        @JvmField val LAMBDA_NEW_FUNCTION = LayeredIcon.create(LAMBDA_SERVICE_ICON, AllIcons.Actions.New)
        @JvmField val LAMBDA_OPEN_FUNCTION = LayeredIcon.create(LAMBDA_SERVICE_ICON, AllIcons.Nodes.RunnableMark)
        @JvmField val LAMBDA_FUNCTION_ICON = IconLoader.getIcon("/icons/function.png")
        @JvmField val SQS_SERVICE_ICON = IconLoader.getIcon("/icons/sqs-service.png")
        @JvmField val SQS_QUEUE_ICON = IconLoader.getIcon("/icons/index.png")
        @JvmField val SNS_SERVICE_ICON = IconLoader.getIcon("/icons/sns-service.png")
        @JvmField val SNS_TOPIC_ICON = IconLoader.getIcon("/icons/sns-topic.png")
        @JvmField val EC2_SERVICE_ICON = IconLoader.getIcon("/icons/rds-service.png")
        @JvmField val EC2_INSTANCE_ICON = IconLoader.getIcon("/icons/index.png")
    }
}
