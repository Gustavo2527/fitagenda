
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM ('lembrete', 'confirmacao');

-- Create scheduled_notifications table
CREATE TABLE public.scheduled_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type public.notification_type NOT NULL,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scheduled_notifications_pending ON public.scheduled_notifications (send_at) WHERE sent = false;
CREATE INDEX idx_scheduled_notifications_user ON public.scheduled_notifications (user_id);
CREATE INDEX idx_scheduled_notifications_session ON public.scheduled_notifications (session_id);

-- Enable RLS
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled notifications"
  ON public.scheduled_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled notifications"
  ON public.scheduled_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled notifications"
  ON public.scheduled_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled notifications"
  ON public.scheduled_notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Service role policy for edge functions (bypasses RLS via service role, but adding for completeness)
CREATE POLICY "Service can manage all notifications"
  ON public.scheduled_notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
