export type KapsoPhoneNumber = {
  id: string;
  internal_id?: string;
  phone_number_id: string;
  name?: string;
  business_account_id?: string;
  is_coexistence?: boolean;
  inbound_processing_enabled?: boolean;
  calls_enabled?: boolean;
  webhook_verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
  display_name?: string;
  display_phone_number?: string;
  display_phone_number_normalized?: string;
  verified_name?: string;
  quality_rating?: string;
  throughput_tier?: string;
  whatsapp_business_manager_messaging_limit?: string | number;
  customer_id?: string;
  code_verification_status?: string;
  name_status?: string;
  status?: string;
  is_official_business_account?: boolean;
  is_pin_enabled?: boolean;
};

export type InboxSettings = {
  selectedPhoneNumberIds: string[];
  defaultPhoneNumberId?: string;
};

export type InboxSettingsResponse = {
  phoneNumbers: KapsoPhoneNumber[];
  selectedPhoneNumberIds: string[];
  defaultPhoneNumberId?: string;
  hasStoredSettings: boolean;
};
