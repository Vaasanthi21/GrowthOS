export function substituteVariables(template, lead) {
  return template
    .replace("{{college_name}}", lead.collegeName || "")
    .replace("{{contact_name}}", lead.contactName || "")
    .replace("{{demo_link}}", lead.demoLink || "");
}
