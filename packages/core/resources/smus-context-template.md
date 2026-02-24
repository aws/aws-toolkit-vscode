---
inclusion: always
---

# SageMaker Unified Studio Space Context

This workspace is running on an Amazon SageMaker Unified Studio Space.

## Environment
- Operating system: Ubuntu-based SageMaker Distribution
- User: sagemaker-user
- Home directory: /home/sagemaker-user
- AWS credentials are available via the container credentials provider (AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
- Do NOT hardcode AWS credentials; use the default credential chain (e.g., boto3.Session())

## Project Info
- ~/README.md contains project-specific configuration such as connection names and available compute resources.
- ~/shared/README.md contains shared project data catalog and storage information.
Refer to these files when you need details about the project's connections, databases, or S3 paths.

## Project Library (`sagemaker_studio`)
The `sagemaker_studio` package is pre-installed and provides access to project resources.

### Project
```python
from sagemaker_studio import Project
project = Project()

project.id
project.name
project.iam_role          # project IAM role ARN
project.kms_key_arn       # project KMS key ARN (if configured)
project.mlflow_tracking_server_arn  # MLflow ARN (if configured)
project.s3.root           # project S3 root path
```

### Connections
```python
project.connections                          # list all connections
project.connection()                         # default IAM connection
project.connection("redshift")               # named connection
conn.name, conn.id, conn.iam_role
conn.physical_endpoints[0].host              # endpoint host
conn.data                                    # all connection properties
conn.secret                                  # credentials (dict or string)
conn.create_client()                         # boto3 client with connection credentials
conn.create_client("glue")                   # boto3 client for specific service
```

### Catalogs, Databases, and Tables
```python
catalog = project.connection().catalog()     # default catalog
catalog = project.connection().catalog("catalog_id")
catalog.databases                            # list databases
db = catalog.database("my_db")
db.tables                                    # list tables
table = db.table("my_table")
table.columns                                # list columns (name, type)
```

### SQL Utilities
```python
from sagemaker_studio import sqlutils

# DuckDB (local, no connection needed)
result = sqlutils.sql("SELECT * FROM my_df WHERE id > 1")

# Athena
result = sqlutils.sql("SELECT * FROM orders", connection_name="project.athena")

# Redshift
result = sqlutils.sql("SELECT * FROM products", connection_name="project.redshift")

# Parameterized queries
result = sqlutils.sql(
    "SELECT * FROM orders WHERE status = :status",
    parameters={"status": "completed"},
    connection_name="project.redshift"
)

# Get SQLAlchemy engine
engine = sqlutils.get_engine(connection_name="project.redshift")
```

### DataFrame Utilities
```python
from sagemaker_studio import dataframeutils
import pandas as pd

# Read from catalog table
df = pd.read_catalog_table(database="my_db", table="my_table")

# Write to catalog table
df.to_catalog_table(database="my_db", table="my_table")

# S3 Tables catalog
df = pd.read_catalog_table(
    database="my_db", table="my_table",
    catalog="s3tablescatalog/my_catalog"
)
```

### Spark Utilities
```python
from sagemaker_studio import sparkutils

# Initialize Spark Connect session
spark = sparkutils.init()
spark = sparkutils.init(connection_name="my_spark_connection")

# Get Spark options for JDBC connections
options = sparkutils.get_spark_options("my_redshift_connection")
df = spark.read.format("jdbc").options(**options).option("dbtable", "my_table").load()
```

## Compute Options
- **Local Python**: Runs directly on the Space instance. Use for single-machine Python, ML, and AI workloads.
- **Apache Spark (AWS Glue / Amazon EMR)**: Use `%%pyspark`, `%%scalaspark`, or `%%sql` cell magics in notebooks. Default Spark connection is `project.spark.compatibility`.
- **SQL (Athena)**: Use `%%sql project.athena` for Trino SQL queries via Amazon Athena.
- **SQL (Redshift)**: Use `%%sql project.redshift` if a Redshift connection is available.

## Code Patterns
- Use `sagemaker_studio.Project()` for project-aware sessions and resource discovery
- Reference data using S3 URIs in s3://bucket/prefix format
- Write Spark DataFrames to the project catalog: `df.write.saveAsTable(f"{database}.table_name", format='parquet', mode='overwrite')`
- SQL query results are available as DataFrames in subsequent cells via the `_` variable
- Use `sqlutils.sql()` for programmatic SQL execution against any connection
- Use `pd.read_catalog_table()` / `df.to_catalog_table()` for pandas catalog I/O

## MCP Server Configuration
- When configuring MCP servers, pass AWS credentials via environment variable expansion:
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI": "${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}"
