output "public_ip" {
  value = aws_eip.app.public_ip
}

output "site_url" {
  description = "Send this link to your friends"
  value       = "https://${local.site_host}"
}

output "dns_note" {
  value = var.domain != "" ? "Create an A record: ${var.domain} -> ${aws_eip.app.public_ip}" : "No DNS needed, using sslip.io"
}