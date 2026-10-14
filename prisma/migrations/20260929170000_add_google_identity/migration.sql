ALTER TABLE public.users
ADD COLUMN google_subject varchar(255);

ALTER TABLE public.users
ADD CONSTRAINT uq_users_google_subject UNIQUE (google_subject);
