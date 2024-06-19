# Define the provider, in this case, AWS
provider "aws" {
  region = "us-west-2"
}

# Define an AWS instance resource
resource "aws_instance" "example" {
  ami           = "ami-0c55b159cbfafe1f0"  # Amazon Linux 2 AMI ID
  instance_type = "t2.micro"

  tags = {
    Name = "example-instance"
  }
}

# Define a security group for the instance
resource "aws_security_group" "example" {
  name        = "example"
  description = "Example security group"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Associate the security group with the instance
resource "aws_instance" "example" {
  security_groups = [aws_security_group.example.name]
}
