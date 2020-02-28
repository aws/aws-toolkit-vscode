// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.ui.ColoredListCellRenderer
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources.LIST_REGISTRIES_AND_SCHEMAS
import software.aws.toolkits.jetbrains.ui.AwsConnection
import software.aws.toolkits.jetbrains.ui.LazyAwsConnectionEvaluator
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.ui.wizard.SchemaSelectionPanelBase.Companion.DEFAULT_EVENT_DETAIL_TYPE
import software.aws.toolkits.jetbrains.ui.wizard.SchemaSelectionPanelBase.Companion.DEFAULT_EVENT_SOURCE
import java.io.File
import javax.swing.JPanel

class SchemaSelectionPanelTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val AWSToolkitUserAgent = "AWSToolkit"

    private val REGISTRY_NAME = "Registry"
    private val REGISTRY_ITEM = SchemaSelectionItem.RegistryItem(REGISTRY_NAME)

    private val SCHEMA_VERSION = "1"

    private val AWS_SCHEMA_NAME = "aws.ec2@EC2InstanceStateChangeNotification"
    private val AWS_SCHEMA_EXPECTED_PACKAGE_NAME = "schema.aws.ec2.ec2instancestatechangenotification"
    private val AWS_SCHEMA_ITEM = SchemaSelectionItem.SchemaItem(AWS_SCHEMA_NAME, REGISTRY_NAME)
    private val AWS_SCHEMA = File(javaClass.getResource("/awsEventSchema.json.txt").toURI()).readText(Charsets.UTF_8)

    private val PARTNER_SCHEMA_NAME = "aws.partner-mongodb.com/1234567-tickets@Ticket.Created"
    private val PARTNER_SCHEMA_EXPECTED_PACKAGE_NAME = "schema.aws.partner.mongodb_com_1234567_tickets.ticket_created"
    private val PARTNER_SCHEMA_ITEM = SchemaSelectionItem.SchemaItem(PARTNER_SCHEMA_NAME, REGISTRY_NAME)
    private val PARTNER_SCHEMA = File(javaClass.getResource("/partnerEventSchema.json.txt").toURI()).readText(Charsets.UTF_8)

    private val CUSTOMER_UPLOADED_SCHEMA_NAME = "someCustomer.SomeAwesomeSchema"
    private val CUSTOMER_UPLOADED_SCHEMA_EXPECTED_PACKAGE_NAME = "schema.somecustomer_someawesomeschema"
    private val CUSTOMER_UPLOADED_SCHEMA_ITEM = SchemaSelectionItem.SchemaItem(CUSTOMER_UPLOADED_SCHEMA_NAME, REGISTRY_NAME)
    private val CUSTOMER_UPLOADED_SCHEMA = File(javaClass.getResource("/customerUploadedEventSchema.json.txt").toURI()).readText(Charsets.UTF_8)

    private val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME = "someCustomer.multipleTypes@SomeOtherAwesomeSchema"
    private val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_EXPECTED_PACKAGE_NAME = "schema.somecustomer_multipletypes.someotherawesomeschema"
    private val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_ITEM = SchemaSelectionItem.SchemaItem(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME, REGISTRY_NAME)
    private val CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES =
        File(javaClass.getResource("/customerUploadedEventSchemaMultipleTypes.json.txt").toURI()).readText(Charsets.UTF_8)

    private val mockSamProjectBuilder = mock<SamProjectBuilder>()
    private val RUNTIME_GROUP = RuntimeGroup.JAVA

    private val mockResourceSelector = mock<ResourceSelector<SchemaSelectionItem>>()
    private val mockPanel = mock<JPanel>()

    private val mockResourceBuilderOptions = mock<ResourceSelector.ResourceBuilderOptions<SchemaSelectionItem>>()
    private val mockResourceSelectorBuilder = mock<ResourceSelector.ResourceBuilder>()

    private lateinit var schemaSelectionPanel: SchemaResourceSelectorSelectionPanel

    @Before
    fun setUp() {
        initMockResourceCache()
        initMockResourceSelector()

        schemaSelectionPanel = SchemaResourceSelectorSelectionPanel(
            mockSamProjectBuilder,
            RUNTIME_GROUP,
            projectRule.project,
            resourceSelectorBuilder = mockResourceSelectorBuilder,
            useSpeedSearch = false,
            rootPanelBuilder = { mockPanel }
        )
        runInEdtAndWait {
            schemaSelectionPanel.reloadSchemas()
        }
    }

    private fun initMockResourceCache() {
        getMockResourceCache().addEntry(
            SchemasResources.getSchema(REGISTRY_NAME, AWS_SCHEMA_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(AWS_SCHEMA_NAME)
                .content(AWS_SCHEMA)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        getMockResourceCache().addEntry(
            SchemasResources.getSchema(REGISTRY_NAME, PARTNER_SCHEMA_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(PARTNER_SCHEMA_NAME)
                .content(PARTNER_SCHEMA)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        getMockResourceCache().addEntry(
            SchemasResources.getSchema(REGISTRY_NAME, CUSTOMER_UPLOADED_SCHEMA_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(CUSTOMER_UPLOADED_SCHEMA_NAME)
                .content(CUSTOMER_UPLOADED_SCHEMA)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        getMockResourceCache().addEntry(
            SchemasResources.getSchema(REGISTRY_NAME, CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME),
            DescribeSchemaResponse.builder()
                .schemaName(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME)
                .content(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES)
                .schemaVersion(SCHEMA_VERSION)
                .build()
        )
        getMockResourceCache()
            .addEntry(
                LIST_REGISTRIES_AND_SCHEMAS,
                listOf(REGISTRY_ITEM, AWS_SCHEMA_ITEM, PARTNER_SCHEMA_ITEM, CUSTOMER_UPLOADED_SCHEMA_ITEM, CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_ITEM)
            )
    }

    private fun initMockResourceSelector() {
        mockResourceBuilderOptions.stub {
            on { comboBoxModel(any()) }.thenReturn(mockResourceBuilderOptions)
            on { customRenderer(any<ColoredListCellRenderer<SchemaSelectionItem>>()) }.thenReturn(mockResourceBuilderOptions)
            on { disableAutomaticLoading() }.thenReturn(mockResourceBuilderOptions)
            on { disableAutomaticSorting() }.thenReturn(mockResourceBuilderOptions)
            on { awsConnection(any<AwsConnection>()) }.thenReturn(mockResourceBuilderOptions)
            on { awsConnection(any<LazyAwsConnectionEvaluator>()) }.thenReturn(mockResourceBuilderOptions)
            on { build() }.thenReturn(mockResourceSelector)
        }

        mockResourceSelectorBuilder.stub {
            on { resource(any<Resource<List<SchemaSelectionItem>>>()) }.thenReturn(mockResourceBuilderOptions)
        }
    }

    @Test
    fun schemaTemplateParametersNullWithoutSelection() {
        mockResourceSelector.stub {
            on { selected() }.thenReturn(null)
        }

        val schemaTemplateParameters = schemaSelectionPanel.buildSchemaTemplateParameters()

        assertThat(schemaTemplateParameters).isNull()
    }

    @Test
    fun schemaTemplateParametersNullIfRegistrySelected() {
        mockResourceSelector.stub {
            on { selected() }.thenReturn(REGISTRY_ITEM)
        }

        val schemaTemplateParameters = schemaSelectionPanel.buildSchemaTemplateParameters()

        assertThat(schemaTemplateParameters).isNull()
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionAwsSchema() {
        mockResourceSelector.stub {
            on { selected() }.thenReturn(AWS_SCHEMA_ITEM)
        }

        val schemaTemplateParameters = schemaSelectionPanel.buildSchemaTemplateParameters()

        assertAwsSchemaParameters(schemaTemplateParameters)
    }

    private fun assertAwsSchemaParameters(schemaTemplateParameters: SchemaTemplateParameters?) {
        assertThat(schemaTemplateParameters).isNotNull
        assertThat(schemaTemplateParameters?.schema?.registryName).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.schemaVersion).isEqualTo(SCHEMA_VERSION)

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(AWS_SCHEMA_NAME)

        assertThat(schemaTemplateParameters?.templateExtraContext).isNotNull
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRegistry).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRootEventName).isEqualTo("EC2InstanceStateChangeNotification")
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaPackageHierarchy).isEqualTo(AWS_SCHEMA_EXPECTED_PACKAGE_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.source).isEqualTo("aws.ec2")
        assertThat(schemaTemplateParameters?.templateExtraContext?.detailType).isEqualTo("EC2 Instance State-change Notification")
        assertThat(schemaTemplateParameters?.templateExtraContext?.userAgent).isEqualTo(AWSToolkitUserAgent)
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionPartnerSchema() {
        mockResourceSelector.stub {
            on { selected() }.thenReturn(PARTNER_SCHEMA_ITEM)
        }

        val schemaTemplateParameters = schemaSelectionPanel.buildSchemaTemplateParameters()

        assertThat(schemaTemplateParameters).isNotNull
        assertThat(schemaTemplateParameters?.schema?.registryName).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.schemaVersion).isEqualTo(SCHEMA_VERSION)

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(PARTNER_SCHEMA_NAME)

        assertThat(schemaTemplateParameters?.templateExtraContext).isNotNull
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRegistry).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRootEventName).isEqualTo("aws_partner_mongodb_com_Ticket_Created")
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaPackageHierarchy).isEqualTo(PARTNER_SCHEMA_EXPECTED_PACKAGE_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.source).isEqualTo("aws.partner-mongodb.com")
        assertThat(schemaTemplateParameters?.templateExtraContext?.detailType).isEqualTo("MongoDB Trigger for my_store.reviews")
        assertThat(schemaTemplateParameters?.templateExtraContext?.userAgent).isEqualTo(AWSToolkitUserAgent)
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionCustomerUploadedSchema() {
        mockResourceSelector.stub {
            on { selected() }.thenReturn(CUSTOMER_UPLOADED_SCHEMA_ITEM)
        }

        val schemaTemplateParameters = schemaSelectionPanel.buildSchemaTemplateParameters()
        assertCustomerUploadedSchemaParameters(
            CUSTOMER_UPLOADED_SCHEMA_NAME,
            "Some_Awesome_Schema",
            CUSTOMER_UPLOADED_SCHEMA_EXPECTED_PACKAGE_NAME,
            schemaTemplateParameters
        )
    }

    @Test
    fun schemaTemplateParametersBuiltAfterSelectionCustomerUploadedSchemaMultipleTypes() {
        mockResourceSelector.stub {
            on { selected() }.thenReturn(CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_ITEM)
        }

        val schemaTemplateParameters = schemaSelectionPanel.buildSchemaTemplateParameters()
        assertCustomerUploadedSchemaParameters(
            CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_NAME,
            "Some_Awesome_Schema_Object_1",
            CUSTOMER_UPLOADED_SCHEMA_MULTIPLE_TYPES_EXPECTED_PACKAGE_NAME,
            schemaTemplateParameters
        )
    }

    private fun assertCustomerUploadedSchemaParameters(
        schemaName: String,
        schemaRootEventName: String,
        schemaPackageHierarchy: String,
        schemaTemplateParameters: SchemaTemplateParameters?
    ) {
        assertThat(schemaTemplateParameters).isNotNull
        assertThat(schemaTemplateParameters?.schema?.registryName).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.schemaVersion).isEqualTo(SCHEMA_VERSION)

        assertThat(schemaTemplateParameters?.schema?.name).isEqualTo(schemaName)

        assertThat(schemaTemplateParameters?.templateExtraContext).isNotNull
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRegistry).isEqualTo(REGISTRY_NAME)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaRootEventName).isEqualTo(schemaRootEventName)
        assertThat(schemaTemplateParameters?.templateExtraContext?.schemaPackageHierarchy).isEqualTo(schemaPackageHierarchy)
        assertThat(schemaTemplateParameters?.templateExtraContext?.source).isEqualTo(DEFAULT_EVENT_SOURCE)
        assertThat(schemaTemplateParameters?.templateExtraContext?.detailType).isEqualTo(DEFAULT_EVENT_DETAIL_TYPE)
        assertThat(schemaTemplateParameters?.templateExtraContext?.userAgent).isEqualTo(AWSToolkitUserAgent)
    }

    private fun getMockResourceCache() = MockResourceCache.getInstance(projectRule.project)
}
