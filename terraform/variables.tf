variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "instance_type" {
  description = "Free tier eligible instance type"
  type        = string
  default     = "t3.micro"
}

variable "repo_url" {
  description = "Public git repo to deploy"
  type        = string
  default     = "https://github.com/nikhil-flux/sehwas-random-chat-app.git"
}

variable "domain" {
  description = "Your domain. Leave empty to use a free <ip>.sslip.io name"
  type        = string
  default     = ""
}

variable "ssh_cidr" {
  description = "Your IP for SSH, e.g. 203.0.113.5/32. Leave empty to disable SSH"
  type        = string
  default     = ""
}

variable "key_name" {
  description = "Existing EC2 key pair name for SSH. Leave empty for none"
  type        = string
  default     = ""
}

variable "budget_email" {
  description = "Email for a $5/month budget alert. Leave empty to skip"
  type        = string
  default     = ""
}