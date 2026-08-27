ALTER TABLE "Message_v2"
  ADD CONSTRAINT "Message_v2_parts_no_inline_image_data_urls"
  CHECK (position('data:image/' in "parts"::text) = 0)
  NOT VALID;

ALTER TABLE "Message_v2"
  VALIDATE CONSTRAINT "Message_v2_parts_no_inline_image_data_urls";
