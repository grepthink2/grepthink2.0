


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


CREATE TYPE "public"."term" AS ENUM (
    'fall',
    'winter',
    'spring',
    'summer'
);


ALTER TYPE "public"."term" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'teacher',
    'ta',
    'guest'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_conversation_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE conversations
       SET last_message_at = NEW.created_at
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_conversation_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  claims jsonb;
  v_user_id uuid;
  v_user_role text;
  meta_role text;
begin
  -- Access user id
  v_user_id := (event ->> 'user_id')::uuid;
  -- Ensure we have a claims object
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- First try to find role in provided claims (user_metadata or app_metadata)
  meta_role := null;
  if jsonb_typeof(claims->'user_metadata') = 'object' then
    meta_role := (claims->'user_metadata')->> 'role';
  end if;
  if meta_role is null or meta_role = '' then
    if jsonb_typeof(claims->'app_metadata') = 'object' then
      meta_role := (claims->'app_metadata')->> 'role';
    end if;
  end if;

  -- If no role in metadata, fall back to profiles table lookup (if we have user id)
  if (meta_role is null or meta_role = '') and v_user_id is not null then
    select role into v_user_role
    from public.profiles
    where id = v_user_id
    limit 1;
  else
    v_user_role := meta_role;
  end if;

  -- Keep the Postgres mapped role as 'authenticated' (so DB mapping unchanged)
  claims := jsonb_set(claims, '{role}', to_jsonb('authenticated'::text), true);

  -- Add user_role claim (explicit null if not found)
  if v_user_role is not null and v_user_role <> '' then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(v_user_role), true);
  else
    claims := jsonb_set(claims, '{app_role}', 'null'::jsonb, true);
  end if;

  -- Update event and return
  event := jsonb_set(event, '{claims}', claims, true);
  return event;
end;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if (TG_OP = 'INSERT') then
    insert into public.profiles (id, email, display_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'student');
  elsif (TG_OP = 'UPDATE') then
    update public.profiles
    set email = new.email,
        display_name = coalesce(new.raw_user_meta_data->>'full_name', new.email)
    where id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_auth_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r text;
begin
  r := coalesce(new.raw_user_meta_data->>'role','student');
  if lower(r) = 'instructor' then r := 'teacher'; end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, r);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_role_sanitizer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.role is null or not (new.role = any (array['instructor','student'])) then
      new.role := 'student';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_role_sanitizer"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."TSRs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evaluator_id" "uuid" DEFAULT "gen_random_uuid"(),
    "evaluatee_id" "uuid" DEFAULT "gen_random_uuid"(),
    "project_id" "uuid" DEFAULT "gen_random_uuid"(),
    "percent_contribution" bigint,
    "positive_feedback" "text",
    "constructive_feedback" "text",
    "scrum_master_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "week" bigint,
    "assignment_id" "uuid",
    "scrum_master_tickets" "text",
    "scrum_master_assessment" "text"
);


ALTER TABLE "public"."TSRs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "Title" "text",
    "open_date" "date",
    "close_date" "date",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid",
    "assignment_type" "text"
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "status" "text" NOT NULL,
    "marked_by" "uuid",
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_status_valid" CHECK (("status" = ANY (ARRAY['present'::"text", 'late'::"text", 'absent'::"text"]))),
    CONSTRAINT "attendance_week_positive" CHECK (("week_number" >= 1))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "enrollment_role" "text" DEFAULT 'student'::"text" NOT NULL,
    CONSTRAINT "class_enrollments_enrollment_role_check" CHECK (("enrollment_role" = ANY (ARRAY['student'::"text", 'ta'::"text"])))
);


ALTER TABLE "public"."class_enrollments" OWNER TO "postgres";


COMMENT ON TABLE "public"."class_enrollments" IS 'Tracks which students are enrolled in which classes';



COMMENT ON COLUMN "public"."class_enrollments"."class_id" IS 'Foreign key to classes table';



COMMENT ON COLUMN "public"."class_enrollments"."user_id" IS 'Foreign key to users table (student)';



COMMENT ON COLUMN "public"."class_enrollments"."enrolled_at" IS 'Timestamp when the student was enrolled';


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "course_code" "text" NOT NULL,
    "year" double precision,
    "term" "text",
    "start_date" "date",
    "can_students_make_project" boolean,
    "image_url" "text",
    "status" "text" NOT NULL,
    "review_period_open" boolean DEFAULT false NOT NULL,
    "review_zoom_url" "text"
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_deletes" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_deletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_reads" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone,
    CONSTRAINT "conversations_canonical_order" CHECK (("user_a" < "user_b"))
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "q1_liked" "text" NOT NULL,
    "q2_frustrating" "text" NOT NULL,
    "q3_missing_feature" "text" NOT NULL,
    "q4_bugs" "text" NOT NULL,
    "q5_suggestions" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_form" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "interest_value" smallint NOT NULL,
    "interest_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interest_form_value_range" CHECK ((("interest_value" >= 1) AND ("interest_value" <= 5)))
);


ALTER TABLE "public"."interest_form" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "taking_115c" boolean,
    "previous_project_name" "text",
    "previous_project_link" "text",
    "notes" "text",
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interest_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_team_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "peer_user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interest_team_preferences_kind_valid" CHECK (("kind" = ANY (ARRAY['work_with'::"text", 'dont_work_with'::"text"]))),
    CONSTRAINT "interest_team_preferences_no_self" CHECK (("user_id" <> "peer_user_id"))
);


ALTER TABLE "public"."interest_team_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_body_length" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 1024)))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "linkedin" "text",
    "github" "text",
    "image_url" "text",
    "edu_email" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['instructor'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" DEFAULT "gen_random_uuid"(),
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "reviewed_at" timestamp with time zone,
    "reviewer_id" "uuid" DEFAULT "gen_random_uuid"(),
    "request_status" "public"."request_status",
    "invited_by" "uuid"
);


ALTER TABLE "public"."project_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "project_id" "uuid" DEFAULT "gen_random_uuid"(),
    "role" "text"
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_review_tas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_review_tas" OWNER TO "postgres";


-- Final-review scoring + Review-TA notes (2026-07-24 migration). Constraints
-- consolidated inline for readability.

CREATE TABLE IF NOT EXISTS "public"."final_review_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL REFERENCES "public"."classes"("id") ON DELETE CASCADE,
    "project_id" "uuid" NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "role" "text" NOT NULL,
    "product" numeric(2,1),
    "team" numeric(2,1),
    "scrum" numeric(2,1),
    "overall" numeric(2,1),
    "notes" "text",
    "scored_by" "uuid" REFERENCES "public"."profiles"("id"),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "final_review_scores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "final_review_scores_uniq" UNIQUE ("project_id", "student_id", "role"),
    CONSTRAINT "final_review_scores_role_valid" CHECK ("role" IN ('home', 'review', 'instructor')),
    CONSTRAINT "final_review_scores_bounds" CHECK (
        ("product" IS NULL OR ("product" BETWEEN 1.0 AND 5.0)) AND
        ("team"    IS NULL OR ("team"    BETWEEN 1.0 AND 5.0)) AND
        ("scrum"   IS NULL OR ("scrum"   BETWEEN 1.0 AND 5.0)) AND
        ("overall" IS NULL OR ("overall" BETWEEN 1.0 AND 5.0))
    ),
    CONSTRAINT "final_review_scores_shape" CHECK (
        ("role" = 'home' AND "overall" IS NULL
             AND "product" IS NOT NULL AND "team" IS NOT NULL AND "scrum" IS NOT NULL)
        OR
        ("role" <> 'home' AND "overall" IS NOT NULL
             AND "product" IS NULL AND "team" IS NULL AND "scrum" IS NULL)
    )
);


ALTER TABLE "public"."final_review_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."final_review_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL REFERENCES "public"."classes"("id") ON DELETE CASCADE,
    "project_id" "uuid" NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "template_version" integer DEFAULT 1 NOT NULL,
    "updated_by" "uuid" REFERENCES "public"."profiles"("id"),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "final_review_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "final_review_notes_project_unique" UNIQUE ("project_id")
);


ALTER TABLE "public"."final_review_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_size" bigint,
    "skills" "jsonb",
    "looking_for_roles" "jsonb",
    "sentiment" "text",
    "num_members" bigint,
    "sponsor_name" "text",
    "sponsor_company" "text",
    "sponsor_email" "text",
    "sponsor_website" "text",
    "sponsor_description" "text",
    "image_url" "text",
    "assigned_ta_id" "uuid",
    "final_review_at" timestamp with time zone,
    "zoom_url" "text",
    "meeting_day" "text",
    "meeting_time" "text",
    CONSTRAINT "projects_meeting_day_valid" CHECK ((("meeting_day" IS NULL) OR ("lower"("meeting_day") = ANY (ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"]))))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."looking_for_roles" IS 'Holds roles the project is looking for';



CREATE TABLE IF NOT EXISTS "public"."roster_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "email" "text",
    "status" "text",
    "matched_profile_id" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "is_manual" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."roster_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."v_user_role" (
    "role" "text"
);


ALTER TABLE "public"."v_user_role" OWNER TO "postgres";


ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_unique_slot" UNIQUE ("project_id", "user_id", "week_number");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_user_id_key" UNIQUE ("class_id", "user_id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_deletes"
    ADD CONSTRAINT "conversation_deletes_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_unique_pair" UNIQUE ("user_a", "user_b");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_unique" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_unique" UNIQUE ("user_id", "class_id", "project_id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_unique" UNIQUE ("user_id", "class_id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_unique" UNIQUE ("user_id", "class_id", "peer_user_id", "kind");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_edu_email_key" UNIQUE ("edu_email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_project_unique" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roster_entries"
    ADD CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id");



CREATE INDEX "attendance_project_week_idx" ON "public"."attendance" USING "btree" ("project_id", "week_number");



CREATE INDEX "attendance_user_idx" ON "public"."attendance" USING "btree" ("user_id");



CREATE INDEX "class_enrollments_class_id_idx" ON "public"."class_enrollments" USING "btree" ("class_id");



CREATE INDEX "class_enrollments_user_id_idx" ON "public"."class_enrollments" USING "btree" ("user_id");



CREATE INDEX "classes_course_code_idx" ON "public"."classes" USING "btree" ("course_code");



CREATE INDEX "classes_created_by_idx" ON "public"."classes" USING "btree" ("created_by");



CREATE INDEX "conversations_last_message_at_idx" ON "public"."conversations" USING "btree" ("last_message_at" DESC NULLS LAST);



CREATE INDEX "conversations_user_a_idx" ON "public"."conversations" USING "btree" ("user_a");



CREATE INDEX "conversations_user_b_idx" ON "public"."conversations" USING "btree" ("user_b");



CREATE INDEX "idx_class_enrollments_class_id" ON "public"."class_enrollments" USING "btree" ("class_id");



CREATE INDEX "idx_class_enrollments_role" ON "public"."class_enrollments" USING "btree" ("class_id", "enrollment_role");



CREATE INDEX "idx_class_enrollments_user_id" ON "public"."class_enrollments" USING "btree" ("user_id");



CREATE INDEX "idx_feedback_submissions_assignment" ON "public"."feedback_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_profiles_id" ON "public"."profiles" USING "btree" ("id");



CREATE INDEX "idx_final_review_notes_class" ON "public"."final_review_notes" USING "btree" ("class_id");



CREATE INDEX "idx_final_review_scores_class" ON "public"."final_review_scores" USING "btree" ("class_id");



CREATE INDEX "idx_final_review_scores_project" ON "public"."final_review_scores" USING "btree" ("project_id");



CREATE INDEX "idx_final_review_scores_student" ON "public"."final_review_scores" USING "btree" ("student_id");



CREATE INDEX "idx_project_review_tas_class" ON "public"."project_review_tas" USING "btree" ("class_id");



CREATE INDEX "idx_project_review_tas_project" ON "public"."project_review_tas" USING "btree" ("project_id");



CREATE INDEX "idx_project_review_tas_user" ON "public"."project_review_tas" USING "btree" ("user_id");



CREATE INDEX "interest_form_class_idx" ON "public"."interest_form" USING "btree" ("class_id");



CREATE INDEX "interest_form_project_idx" ON "public"."interest_form" USING "btree" ("project_id");



CREATE INDEX "interest_form_user_idx" ON "public"."interest_form" USING "btree" ("user_id", "class_id");



CREATE INDEX "interest_submissions_class_idx" ON "public"."interest_submissions" USING "btree" ("class_id");



CREATE INDEX "interest_team_preferences_class_idx" ON "public"."interest_team_preferences" USING "btree" ("class_id");



CREATE INDEX "interest_team_preferences_peer_idx" ON "public"."interest_team_preferences" USING "btree" ("peer_user_id", "class_id");



CREATE INDEX "messages_conv_created_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE INDEX "projects_assigned_ta_idx" ON "public"."projects" USING "btree" ("assigned_ta_id");



CREATE INDEX "projects_class_id_idx" ON "public"."projects" USING "btree" ("class_id");



CREATE INDEX "projects_created_by_idx" ON "public"."projects" USING "btree" ("created_by");



CREATE OR REPLACE TRIGGER "messages_bump_last_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_conversation_last_message"();



CREATE OR REPLACE TRIGGER "profiles_role_sanitizer_trig" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_role_sanitizer"();



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_evaluatee_id_fkey" FOREIGN KEY ("evaluatee_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."TSRs"
    ADD CONSTRAINT "TSRs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_deletes"
    ADD CONSTRAINT "conversation_deletes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."conversation_deletes"
    ADD CONSTRAINT "conversation_deletes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."interest_form"
    ADD CONSTRAINT "interest_form_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."interest_submissions"
    ADD CONSTRAINT "interest_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_peer_user_id_fkey" FOREIGN KEY ("peer_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."interest_team_preferences"
    ADD CONSTRAINT "interest_team_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_join_requests"
    ADD CONSTRAINT "project_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_review_tas"
    ADD CONSTRAINT "project_review_tas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_assigned_ta_id_fkey" FOREIGN KEY ("assigned_ta_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_entries"
    ADD CONSTRAINT "roster_entries_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."roster_entries"
    ADD CONSTRAINT "roster_entries_matched_profile_id_fkey" FOREIGN KEY ("matched_profile_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Creators can manage classes" ON "public"."classes" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Project creators can manage" ON "public"."projects" USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."TSRs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_deletes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_deletes_select_own" ON "public"."conversation_deletes" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."conversation_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_reads_select_own" ON "public"."conversation_reads" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_select_participant" ON "public"."conversations" FOR SELECT USING ((("auth"."uid"() = "user_a") OR ("auth"."uid"() = "user_b")));



ALTER TABLE "public"."feedback_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_form" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_team_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_select_participant" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("auth"."uid"() = "c"."user_a") OR ("auth"."uid"() = "c"."user_b"))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."project_join_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."final_review_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."final_review_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_review_tas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roster_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."v_user_role" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."bump_conversation_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_conversation_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_conversation_last_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."handle_auth_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_auth_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_auth_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_role_sanitizer"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_role_sanitizer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_role_sanitizer"() TO "service_role";



GRANT ALL ON TABLE "public"."TSRs" TO "anon";
GRANT ALL ON TABLE "public"."TSRs" TO "authenticated";
GRANT ALL ON TABLE "public"."TSRs" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."class_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."class_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."class_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_deletes" TO "anon";
GRANT ALL ON TABLE "public"."conversation_deletes" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_deletes" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_reads" TO "anon";
GRANT ALL ON TABLE "public"."conversation_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_reads" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_submissions" TO "anon";
GRANT ALL ON TABLE "public"."feedback_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."interest_form" TO "anon";
GRANT ALL ON TABLE "public"."interest_form" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_form" TO "service_role";



GRANT ALL ON TABLE "public"."interest_submissions" TO "anon";
GRANT ALL ON TABLE "public"."interest_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."interest_team_preferences" TO "anon";
GRANT ALL ON TABLE "public"."interest_team_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_team_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."project_join_requests" TO "anon";
GRANT ALL ON TABLE "public"."project_join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."project_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."final_review_notes" TO "anon";
GRANT ALL ON TABLE "public"."final_review_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."final_review_notes" TO "service_role";



GRANT ALL ON TABLE "public"."final_review_scores" TO "anon";
GRANT ALL ON TABLE "public"."final_review_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."final_review_scores" TO "service_role";



GRANT ALL ON TABLE "public"."project_review_tas" TO "anon";
GRANT ALL ON TABLE "public"."project_review_tas" TO "authenticated";
GRANT ALL ON TABLE "public"."project_review_tas" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."roster_entries" TO "anon";
GRANT ALL ON TABLE "public"."roster_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_entries" TO "service_role";



GRANT ALL ON TABLE "public"."v_user_role" TO "anon";
GRANT ALL ON TABLE "public"."v_user_role" TO "authenticated";
GRANT ALL ON TABLE "public"."v_user_role" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- ===== Scrum board (2026-08-12_scrum_board.sql) =====
-- Mirrors backend/database/migrations/2026-08/2026-08-12_scrum_board.sql verbatim
-- below (raw DDL, appended as-is — not rewritten into this file's
-- pg_dump-style quoted-identifier sections above). schema.sql already has
-- known drift from the live/dev schema (e.g. the 2026-07-14 group-messaging
-- migration's conversation_participants table is not reflected here); this
-- mirror does not attempt to fix that pre-existing drift.

-- Scrum board: sprints → user stories → tasks, move audit, comments,
-- per-project keys, burnup snapshots, AI-draft quota.
-- Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.
-- RLS on, no policies: service-role backend only (final_review_scoring precedent).
-- Realtime upgrade checklist (NOT done in v1): REPLICA IDENTITY FULL on
-- tasks/scrum_comments, participant-scoped SELECT policies, add tables to the
-- realtime publication in the dashboard.

-- ============ 1) project setting ============
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimate_scale text NOT NULL DEFAULT 'fibonacci';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_estimate_scale_valid;
ALTER TABLE projects ADD CONSTRAINT projects_estimate_scale_valid
  CHECK (estimate_scale IN ('linear','exponential','fibonacci'));

-- ============ 2) sprints ============
CREATE TABLE IF NOT EXISTS sprints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  starts_at  date NOT NULL,
  ends_at    date NOT NULL,
  status     text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sprints_status_valid CHECK (status IN ('planned','active','completed')),
  CONSTRAINT sprints_dates_valid  CHECK (ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, starts_at);
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sprints TO anon, authenticated, service_role;

-- ============ 3) user_stories ============
CREATE TABLE IF NOT EXISTS user_stories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id      uuid REFERENCES sprints(id) ON DELETE SET NULL,  -- NULL ⇒ backlog
  key            text NOT NULL,                                   -- "US-3"
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points         integer CHECK (points > 0),
  time_estimate  text CHECK (char_length(time_estimate) <= 20),
  reporter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at    timestamptz,                                     -- set ⇒ archive view
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_stories_key_uq UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS user_stories_project_sprint_idx ON user_stories (project_id, sprint_id);
ALTER TABLE user_stories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE user_stories TO anon, authenticated, service_role;

-- ============ 4) tasks ============
CREATE TABLE IF NOT EXISTS tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key            text NOT NULL,                                   -- "GT-12"
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points         integer CHECK (points > 0),
  time_estimate  text CHECK (char_length(time_estimate) <= 20),
  status         text NOT NULL DEFAULT 'todo',
  reporter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tags           text[] NOT NULL DEFAULT '{}',
  pr_url         text CHECK (char_length(pr_url) <= 500),
  pr_provider    text,
  pr_state       text,
  pr_checked_at  timestamptz,
  moved_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_key_uq          UNIQUE (project_id, key),
  CONSTRAINT tasks_status_valid    CHECK (status IN ('todo','in_progress','done')),
  CONSTRAINT tasks_provider_valid  CHECK (pr_provider IS NULL OR pr_provider IN ('github','gitlab')),
  CONSTRAINT tasks_pr_state_valid  CHECK (pr_state IS NULL OR pr_state IN ('open','merged','closed','draft')),
  CONSTRAINT tasks_tags_valid      CHECK (tags <@ ARRAY['backend','frontend','ui/ux','infra','design','research','bug','chore','optimization','docs']::text[])
);
CREATE INDEX IF NOT EXISTS tasks_story_idx          ON tasks (story_id);
CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks (project_id, status);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE tasks TO anon, authenticated, service_role;

-- ============ 5) task_moves + apply trigger ============
CREATE TABLE IF NOT EXISTS task_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status   text NOT NULL CHECK (to_status IN ('todo','in_progress','done')),
  moved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_moves_task_idx ON task_moves (task_id, moved_at DESC);
ALTER TABLE task_moves ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE task_moves TO anon, authenticated, service_role;

-- The controller inserts ONLY (task_id, to_status, moved_by); this trigger reads the
-- task's current status into from_status and applies the move — one INSERT is atomic,
-- standing in for the transaction supabase-py can't give us.
CREATE OR REPLACE FUNCTION scrum_apply_task_move() RETURNS trigger AS $$
BEGIN
  SELECT status INTO NEW.from_status FROM tasks WHERE id = NEW.task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task % not found', NEW.task_id; END IF;
  UPDATE tasks SET status = NEW.to_status, moved_by = NEW.moved_by,
                   moved_at = NEW.moved_at, updated_at = NEW.moved_at
   WHERE id = NEW.task_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS task_moves_apply ON task_moves;
CREATE TRIGGER task_moves_apply BEFORE INSERT ON task_moves
  FOR EACH ROW EXECUTE FUNCTION scrum_apply_task_move();

-- ============ 6) comments (story XOR task) ============
CREATE TABLE IF NOT EXISTS scrum_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   uuid REFERENCES user_stories(id) ON DELETE CASCADE,
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body_md    text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrum_comments_parent_xor CHECK (num_nonnulls(story_id, task_id) = 1)
);
CREATE INDEX IF NOT EXISTS scrum_comments_story_idx ON scrum_comments (story_id, created_at);
CREATE INDEX IF NOT EXISTS scrum_comments_task_idx  ON scrum_comments (task_id, created_at);
ALTER TABLE scrum_comments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_comments TO anon, authenticated, service_role;

-- ============ 7) per-project key counters + RPC ============
CREATE TABLE IF NOT EXISTS scrum_counters (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  story_seq  integer NOT NULL DEFAULT 0,
  task_seq   integer NOT NULL DEFAULT 0
);
ALTER TABLE scrum_counters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_counters TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION scrum_next_key(p_project_id uuid, p_kind text) RETURNS integer AS $$
DECLARE v integer;
BEGIN
  IF p_kind NOT IN ('story','task') THEN RAISE EXCEPTION 'bad kind %', p_kind; END IF;
  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  IF p_kind = 'story' THEN
    UPDATE scrum_counters SET story_seq = story_seq + 1 WHERE project_id = p_project_id RETURNING story_seq INTO v;
  ELSE
    UPDATE scrum_counters SET task_seq = task_seq + 1 WHERE project_id = p_project_id RETURNING task_seq INTO v;
  END IF;
  RETURN v;
END; $$ LANGUAGE plpgsql;

-- ============ 8) burnup snapshots ============
CREATE TABLE IF NOT EXISTS sprint_burnup_days (
  sprint_id        uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  day              date NOT NULL,          -- America/Los_Angeles calendar day
  scope_points     integer NOT NULL,
  completed_points integer NOT NULL,
  PRIMARY KEY (sprint_id, day)
);
ALTER TABLE sprint_burnup_days ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sprint_burnup_days TO anon, authenticated, service_role;

-- ============ 9) AI-draft quota ============
CREATE TABLE IF NOT EXISTS ai_draft_usage (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_on date NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, used_on)
);
ALTER TABLE ai_draft_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE ai_draft_usage TO anon, authenticated, service_role;

-- ===== Scrum repos (2026-08-21_scrum_repos.sql) =====
-- Mirrors backend/database/migrations/2026-08/2026-08-21_scrum_repos.sql verbatim.

-- Scrum board D8 revision: per-project repo registry with write-only tokens.
-- Teams register their repo URL(s); an optional access token is used by the
-- backend for PR/MR state fetches (falls back to env token, then anonymous).
-- Tokens are service-role-only data — no API ever returns them (has_token only).
-- Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md (D8, amended 2026-08-21).
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.
-- RLS on, no policies: service-role backend only.

CREATE TABLE IF NOT EXISTS scrum_repos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_url     text NOT NULL CHECK (char_length(repo_url) <= 500),
  provider     text NOT NULL,
  access_token text CHECK (char_length(access_token) <= 200),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrum_repos_provider_valid CHECK (provider IN ('github','gitlab')),
  CONSTRAINT scrum_repos_url_uq UNIQUE (project_id, repo_url)
);
CREATE INDEX IF NOT EXISTS scrum_repos_project_idx ON scrum_repos (project_id);
ALTER TABLE scrum_repos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_repos TO anon, authenticated, service_role;

-- ===== Assignment deadlines, TSR edit timestamps and events (2026-10-06_assignment_deadlines_and_events.sql) =====
-- Mirrors the DDL of backend/database/migrations/2026-10/2026-10-06_assignment_deadlines_and_events.sql.
-- The one-off backfill UPDATEs (due_at from close_date in the school's zone; updated_at = created_at
-- for pre-existing TSR rows) are not schema and are left out on purpose.

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS due_at       timestamptz;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS accept_until timestamptz;

ALTER TABLE public."TSRs" ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tsrs_set_updated_at ON public."TSRs";
CREATE TRIGGER tsrs_set_updated_at BEFORE UPDATE ON public."TSRs"
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  actor_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  class_id    uuid REFERENCES public.classes (id)  ON DELETE SET NULL,
  project_id  uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(meta) <= 2048)
);
CREATE INDEX IF NOT EXISTS events_kind_time_idx  ON public.events (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_class_time_idx ON public.events (class_id, occurred_at DESC)
  WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_actor_time_idx ON public.events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_project_time_idx ON public.events (project_id, occurred_at DESC)
  WHERE project_id IS NOT NULL;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.events_id_seq FROM anon, authenticated;

-- ===== Analytics core (2026-10-07_analytics.sql) =====
-- Applied on DEV 2026-10-08; PROD pending. The cron schedule lives in
-- backend/database/migrations/prod/2026-10/2026-10-07_analytics_cron.sql.

-- ------------------------------------------------------------------ scope helpers ----
-- The classes of one institution (or one class of it). The label is what analytics shows for a
-- class: its name, and its term when it has one. course_code is the join code and never leaves.
CREATE OR REPLACE FUNCTION public.analytics_scope_classes(p_institution uuid, p_class uuid)
RETURNS TABLE (class_id uuid, label text, start_date date, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id,
         c.name || CASE WHEN nullif(btrim(c.term), '') IS NOT NULL THEN ' · ' || btrim(c.term) ELSE '' END,
         c.start_date,
         c.created_at
    FROM classes c
   WHERE c.institution_id = p_institution
     AND (p_class IS NULL OR c.id = p_class);
$$;

-- A team is a project with at least one current member (decision 12). Every section function takes
-- teams from here; the rollup's `teams` metric restates the rule as of each day.
CREATE OR REPLACE FUNCTION public.analytics_scope_teams(p_institution uuid, p_class uuid)
RETURNS TABLE (project_id uuid, class_id uuid, name text, members integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id, p.class_id, p.name, count(DISTINCT pm.user_id)::int
    FROM projects p
    JOIN analytics_scope_classes(p_institution, p_class) s ON s.class_id = p.class_id
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id IS NOT NULL
   GROUP BY p.id, p.class_id, p.name;
$$;

-- Everyone's role in every class: enrollments carry student/ta, the creator is the instructor.
CREATE OR REPLACE FUNCTION public.analytics_user_roles()
RETURNS TABLE (user_id uuid, class_id uuid, role text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT ce.user_id, ce.class_id, ce.enrollment_role FROM class_enrollments ce
  UNION ALL
  SELECT c.created_by, c.id, 'instructor' FROM classes c;
$$;

-- Direct messages that count for a school (decision 3): both users belong to the school, and the pair
-- does not share a class in which one is staff (instructor or TA) and the other a student. Used by the
-- conversations function and the nightly rollup, so the rule lives once.
CREATE OR REPLACE FUNCTION public.analytics_counted_dm(p_institution uuid)
RETURNS TABLE (conversation_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH user_roles AS (SELECT * FROM analytics_user_roles()),
  school_people AS (
    SELECT DISTINCT ur.user_id FROM user_roles ur JOIN classes c ON c.id = ur.class_id
     WHERE c.institution_id = p_institution),
  staff_student_dm AS (
    SELECT DISTINCT cv.id FROM conversations cv
      JOIN user_roles a ON a.user_id = cv.user_a
      JOIN user_roles b ON b.user_id = cv.user_b AND b.class_id = a.class_id
     WHERE cv.type = 'dm'
       AND ((a.role IN ('instructor', 'ta') AND b.role = 'student')
         OR (b.role IN ('instructor', 'ta') AND a.role = 'student')))
  SELECT cv.id FROM conversations cv
   WHERE cv.type = 'dm'
     AND cv.id NOT IN (SELECT id FROM staff_student_dm)
     AND cv.user_a IN (SELECT user_id FROM school_people)
     AND cv.user_b IN (SELECT user_id FROM school_people);
$$;

-- The board as it is now: tasks of non-archived stories of the teams in scope, with the story's sprint
-- ordinal within its project (0 = Backlog). Used by the scrum function and the nightly snapshot.
CREATE OR REPLACE FUNCTION public.analytics_live_tasks(p_institution uuid, p_class uuid)
RETURNS TABLE (project_id uuid, class_id uuid, status text, points integer, ordinal integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  sprint_ordinals AS (
    SELECT sp.id AS sprint_id,
           row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at, sp.id)::int AS ordinal
      FROM sprints sp JOIN teams t ON t.project_id = sp.project_id)
  SELECT tk.project_id, t.class_id, tk.status, coalesce(tk.points, 0), coalesce(so.ordinal, 0)
    FROM tasks tk
    JOIN teams t ON t.project_id = tk.project_id
    JOIN user_stories us ON us.id = tk.story_id AND us.archived_at IS NULL
    LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id;
$$;

-- ------------------------------------------------------------------ scope counts ----
-- Classes, teams (projects with at least one member), students (distinct student enrollments),
-- people of the school who signed in during the last 7 days (NULL until any login event exists; the
-- previous 7-day figure stays NULL until login history covers it, so a launch week never compares
-- against a fabricated 0), and the per-class / per-team rows the breakdown table starts from.
CREATE OR REPLACE FUNCTION public.analytics_scope_counts(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH scope AS (SELECT * FROM analytics_scope_classes(p_institution, p_class)),
  teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  students AS (
    SELECT DISTINCT ce.user_id, ce.class_id
      FROM class_enrollments ce JOIN scope s ON s.class_id = ce.class_id
     WHERE ce.enrollment_role = 'student'),
  school_people AS (
    SELECT DISTINCT ur.user_id
      FROM analytics_user_roles() ur JOIN classes c ON c.id = ur.class_id
     WHERE c.institution_id = p_institution),
  has_logins AS (
    SELECT EXISTS (SELECT 1 FROM events WHERE kind = 'login') AS cur,
           EXISTS (SELECT 1 FROM events WHERE kind = 'login'
                     AND occurred_at < now() - interval '14 days') AS prev),
  active AS (
    SELECT count(DISTINCT e.actor_id) AS n
      FROM events e JOIN school_people sp ON sp.user_id = e.actor_id
     WHERE e.kind = 'login' AND e.occurred_at >= now() - interval '7 days'),
  active_prev AS (
    SELECT count(DISTINCT e.actor_id) AS n
      FROM events e JOIN school_people sp ON sp.user_id = e.actor_id
     WHERE e.kind = 'login'
       AND e.occurred_at >= now() - interval '14 days'
       AND e.occurred_at <  now() - interval '7 days'),
  by_class AS (
    SELECT s.class_id, s.label,
           (SELECT count(*) FROM teams t WHERE t.class_id = s.class_id)     AS teams,
           (SELECT count(*) FROM students st WHERE st.class_id = s.class_id) AS students
      FROM scope s)
  SELECT jsonb_build_object(
    'classes',  (SELECT count(*) FROM scope),
    'teams',    (SELECT count(*) FROM teams),
    'students', (SELECT count(DISTINCT user_id) FROM students),
    'active_users_7d',
      CASE WHEN (SELECT cur FROM has_logins) THEN (SELECT n FROM active) END,
    'active_users_prev_7d',
      CASE WHEN (SELECT prev FROM has_logins) THEN (SELECT n FROM active_prev) END,
    'by_class', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'class_id', class_id, 'label', label, 'teams', teams, 'students', students)
                  ORDER BY label) FROM by_class), '[]'::jsonb),
    'by_team',  coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'project_id', project_id, 'class_id', class_id, 'name', name, 'members', members)
                  ORDER BY name) FROM teams), '[]'::jsonb));
$$;

-- ------------------------------------------------------------------ conversations ----
-- Decision 3: team-member channels of the teams in scope (per class) plus direct messages between two
-- people of the school (school-wide; p_class is ignored for them on purpose), minus any DM whose two
-- users share a class in which one is staff (instructor or TA) and the other a student — the rule is
-- analytics_counted_dm's. team_ta and team_instructor channels never count. Range bounds are the
-- school-zone midnights; weeks start on Monday in the school's zone.
CREATE OR REPLACE FUNCTION public.analytics_conversations(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  counted_dm AS (SELECT conversation_id AS id FROM analytics_counted_dm(p_institution)),
  counted_team AS (
    SELECT cv.id, t.class_id, t.project_id
      FROM conversations cv JOIN teams t ON t.project_id = cv.project_id
     WHERE cv.type = 'team_members'),
  bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE p_tz)            AS cur_start,
           ((p_to + 1)::timestamp AT TIME ZONE p_tz)        AS cur_end,
           (p_prev_from::timestamp AT TIME ZONE p_tz)       AS prev_start,
           ((p_prev_to + 1)::timestamp AT TIME ZONE p_tz)   AS prev_end),
  team_msgs AS (                                   -- from the earliest bound of the two ranges, so the
    SELECT m.created_at, ct.class_id, ct.project_id   -- (conversation_id, created_at) index serves it
      FROM messages m JOIN counted_team ct ON ct.id = m.conversation_id, bounds b
     WHERE m.created_at >= least(b.cur_start, coalesce(b.prev_start, b.cur_start))),
  dm_msgs AS (
    SELECT m.created_at
      FROM messages m JOIN counted_dm cd ON cd.id = m.conversation_id, bounds b
     WHERE m.created_at >= least(b.cur_start, coalesce(b.prev_start, b.cur_start))),
  cur_team AS (SELECT tm.* FROM team_msgs tm, bounds b WHERE tm.created_at >= b.cur_start AND tm.created_at < b.cur_end),
  cur_dm   AS (SELECT dm.* FROM dm_msgs dm,   bounds b WHERE dm.created_at >= b.cur_start AND dm.created_at < b.cur_end),
  weekly AS (
    SELECT week_start, sum(tm) AS team_members, sum(dm) AS dm
      FROM (SELECT date_trunc('week', created_at AT TIME ZONE p_tz)::date AS week_start, 1 AS tm, 0 AS dm FROM cur_team
            UNION ALL
            SELECT date_trunc('week', created_at AT TIME ZONE p_tz)::date, 0, 1 FROM cur_dm) w
     GROUP BY week_start)
  SELECT jsonb_build_object(
    'team_members', (SELECT count(*) FROM cur_team),
    'dm',           (SELECT count(*) FROM cur_dm),
    'total',        (SELECT count(*) FROM cur_team) + (SELECT count(*) FROM cur_dm),
    'prev_team_members', CASE WHEN p_prev_from IS NULL THEN NULL ELSE
      (SELECT count(*) FROM team_msgs tm, bounds b WHERE tm.created_at >= b.prev_start AND tm.created_at < b.prev_end) END,
    'prev_dm', CASE WHEN p_prev_from IS NULL THEN NULL ELSE
      (SELECT count(*) FROM dm_msgs dm, bounds b WHERE dm.created_at >= b.prev_start AND dm.created_at < b.prev_end) END,
    'weekly', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'week_start', week_start, 'team_members', team_members, 'dm', dm) ORDER BY week_start)
                FROM weekly), '[]'::jsonb),
    'by_class', coalesce((SELECT jsonb_agg(jsonb_build_object('class_id', class_id, 'team_messages', n) ORDER BY class_id)
                FROM (SELECT class_id, count(*) AS n FROM cur_team GROUP BY class_id) x), '[]'::jsonb),
    'by_team', coalesce((SELECT jsonb_agg(jsonb_build_object('project_id', project_id, 'team_messages', n) ORDER BY project_id)
                FROM (SELECT project_id, count(*) AS n FROM cur_team GROUP BY project_id) y), '[]'::jsonb));
$$;

-- ------------------------------------------------------------------ scrum ----
-- Created counts and points in the range (archived stories count); the LIVE board snapshot by sprint
-- ordinal within each project (0 = Backlog; tasks of archived stories excluded); the median length of
-- title + description per entity, per ordinal and overall, all time; per-class and per-team rows for
-- the breakdown (points_done / points_total are live board figures).
CREATE OR REPLACE FUNCTION public.analytics_scrum(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH teams AS (SELECT * FROM analytics_scope_teams(p_institution, p_class)),
  bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE p_tz)            AS cur_start,
           ((p_to + 1)::timestamp AT TIME ZONE p_tz)        AS cur_end,
           (p_prev_from::timestamp AT TIME ZONE p_tz)       AS prev_start,
           ((p_prev_to + 1)::timestamp AT TIME ZONE p_tz)   AS prev_end),
  stories AS (
    SELECT us.id, us.project_id, us.sprint_id, us.title, us.description_md, coalesce(us.points, 0) AS points,
           us.archived_at, us.created_at, t.class_id
      FROM user_stories us JOIN teams t ON t.project_id = us.project_id),
  tasks_all AS (
    SELECT tk.id, tk.story_id, tk.project_id, tk.title, tk.description_md, coalesce(tk.points, 0) AS points,
           tk.status, tk.created_at, t.class_id
      FROM tasks tk JOIN teams t ON t.project_id = tk.project_id),
  cur_stories  AS (SELECT s.* FROM stories s,   bounds b WHERE s.created_at >= b.cur_start  AND s.created_at < b.cur_end),
  cur_tasks    AS (SELECT k.* FROM tasks_all k, bounds b WHERE k.created_at >= b.cur_start  AND k.created_at < b.cur_end),
  prev_stories AS (SELECT s.* FROM stories s,   bounds b WHERE s.created_at >= b.prev_start AND s.created_at < b.prev_end),
  prev_tasks   AS (SELECT k.* FROM tasks_all k, bounds b WHERE k.created_at >= b.prev_start AND k.created_at < b.prev_end),
  sprint_ordinals AS (
    SELECT sp.id AS sprint_id,
           row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at, sp.id)::int AS ordinal
      FROM sprints sp JOIN teams t ON t.project_id = sp.project_id),
  live AS (SELECT * FROM analytics_live_tasks(p_institution, p_class)),
  by_sprint AS (
    SELECT ordinal,
           CASE WHEN ordinal = 0 THEN 'Backlog' ELSE 'Sprint ' || ordinal END AS label,
           count(DISTINCT project_id)                                   AS teams,
           count(*) FILTER (WHERE status = 'todo')                      AS todo,
           count(*) FILTER (WHERE status = 'in_progress')               AS in_progress,
           count(*) FILTER (WHERE status = 'done')                      AS done,
           coalesce(sum(points) FILTER (WHERE status = 'todo'), 0)        AS points_todo,
           coalesce(sum(points) FILTER (WHERE status = 'in_progress'), 0) AS points_in_progress,
           coalesce(sum(points) FILTER (WHERE status = 'done'), 0)        AS points_done
      FROM live GROUP BY ordinal),
  chars_src AS (
    SELECT 'task'::text AS entity, coalesce(so.ordinal, 0) AS ordinal,
           char_length(tk.title) + char_length(coalesce(tk.description_md, '')) AS len
      FROM tasks_all tk JOIN stories us ON us.id = tk.story_id
      LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id
    UNION ALL
    SELECT 'story', coalesce(so.ordinal, 0),
           char_length(us.title) + char_length(coalesce(us.description_md, ''))
      FROM stories us LEFT JOIN sprint_ordinals so ON so.sprint_id = us.sprint_id),
  chars AS (
    SELECT entity, ordinal, count(*) AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY len))::int AS median
      FROM chars_src GROUP BY entity, ordinal
    UNION ALL
    SELECT entity, NULL, count(*), round(percentile_cont(0.5) WITHIN GROUP (ORDER BY len))::int
      FROM chars_src GROUP BY entity),
  weekly_tasks AS (
    SELECT date_trunc('week', created_at AT TIME ZONE p_tz)::date AS week_start, count(*) AS n
      FROM cur_tasks GROUP BY 1),
  by_class AS (
    SELECT c.class_id,
           (SELECT count(*) FROM cur_stories s WHERE s.class_id = c.class_id)                               AS stories,
           (SELECT count(*) FROM cur_tasks k WHERE k.class_id = c.class_id)                                 AS tasks,
           (SELECT coalesce(sum(points) FILTER (WHERE status = 'done'), 0) FROM live l WHERE l.class_id = c.class_id) AS points_done,
           (SELECT coalesce(sum(points), 0) FROM live l WHERE l.class_id = c.class_id)                      AS points_total
      FROM (SELECT DISTINCT class_id FROM teams) c),
  by_team AS (
    SELECT t.project_id,
           (SELECT count(*) FROM cur_stories s WHERE s.project_id = t.project_id)                               AS stories,
           (SELECT count(*) FROM cur_tasks k WHERE k.project_id = t.project_id)                                 AS tasks,
           (SELECT coalesce(sum(points) FILTER (WHERE status = 'done'), 0) FROM live l WHERE l.project_id = t.project_id) AS points_done,
           (SELECT coalesce(sum(points), 0) FROM live l WHERE l.project_id = t.project_id)                      AS points_total
      FROM teams t)
  SELECT jsonb_build_object(
    'stories_created',      (SELECT count(*) FROM cur_stories),
    'tasks_created',        (SELECT count(*) FROM cur_tasks),
    'story_points_created', (SELECT coalesce(sum(points), 0) FROM cur_stories),
    'task_points_created',  (SELECT coalesce(sum(points), 0) FROM cur_tasks),
    'prev_stories_created',      CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT count(*) FROM prev_stories) END,
    'prev_tasks_created',        CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT count(*) FROM prev_tasks) END,
    'prev_story_points_created', CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT coalesce(sum(points), 0) FROM prev_stories) END,
    'prev_task_points_created',  CASE WHEN p_prev_from IS NULL THEN NULL ELSE (SELECT coalesce(sum(points), 0) FROM prev_tasks) END,
    'weekly_tasks', coalesce((SELECT jsonb_agg(jsonb_build_object('week_start', week_start, 'tasks_created', n) ORDER BY week_start)
                     FROM weekly_tasks), '[]'::jsonb),
    'by_sprint', coalesce((SELECT jsonb_agg(jsonb_build_object(
                   'ordinal', ordinal, 'label', label, 'teams', teams,
                   'todo', todo, 'in_progress', in_progress, 'done', done,
                   'points_todo', points_todo, 'points_in_progress', points_in_progress, 'points_done', points_done)
                   ORDER BY ordinal) FROM by_sprint), '[]'::jsonb),
    'chars', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'entity', entity, 'ordinal', ordinal,
               'label', CASE WHEN ordinal IS NULL THEN 'All sprints' WHEN ordinal = 0 THEN 'Backlog' ELSE 'Sprint ' || ordinal END,
               'n', n, 'median', median)
               ORDER BY entity, ordinal NULLS FIRST) FROM chars), '[]'::jsonb),
    'by_class', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'class_id', class_id, 'stories', stories, 'tasks', tasks,
                  'points_done', points_done, 'points_total', points_total) ORDER BY class_id) FROM by_class), '[]'::jsonb),
    'by_team', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'project_id', project_id, 'stories', stories, 'tasks', tasks,
                 'points_done', points_done, 'points_total', points_total) ORDER BY project_id) FROM by_team), '[]'::jsonb));
$$;

-- Lockdown for the functions written so far (Task 2 adds the rest).
REVOKE ALL ON FUNCTION public.analytics_scope_classes(uuid, uuid)                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_scope_teams(uuid, uuid)                                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_user_roles()                                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_counted_dm(uuid)                                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_live_tasks(uuid, uuid)                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_scope_counts(uuid, uuid, date, date, date, date, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_conversations(uuid, uuid, date, date, date, date, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_scrum(uuid, uuid, date, date, date, date, text)                 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_scope_classes(uuid, uuid)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_scope_teams(uuid, uuid)                                      TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_user_roles()                                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_counted_dm(uuid)                                             TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_live_tasks(uuid, uuid)                                       TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_scope_counts(uuid, uuid, date, date, date, date, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_conversations(uuid, uuid, date, date, date, date, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_scrum(uuid, uuid, date, date, date, date, text)              TO service_role;

-- ------------------------------------------------------------------ nightly rollup ----
-- One row per (institution, class or NULL, calendar day in the school's zone, metric). Written by
-- analytics_rollup_day(day, true) for yesterday (pg_cron, 09:00 UTC) and by analytics_rollup_range for
-- a backfill (activity metrics only: a board snapshot cannot be reconstructed for a past day). Upserts:
-- re-running the same morning changes nothing; re-running a PAST day with p_snapshot = true would
-- overwrite that day's board snapshot with today's board, so the default is false and the nightly job
-- and the Check pass true for yesterday only. class_id has no foreign key on purpose (header).
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  institution_id uuid        NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
  class_id       uuid,
  day            date        NOT NULL,
  metric         text        NOT NULL CHECK (metric ~ '^[a-z][a-z0-9_]{1,39}$'),
  value          numeric     NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_daily_uq UNIQUE NULLS NOT DISTINCT (institution_id, class_id, day, metric)
);
CREATE INDEX IF NOT EXISTS analytics_daily_inst_day_idx ON public.analytics_daily (institution_id, day);
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_daily FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.analytics_daily TO service_role;   -- explicit: analytics_trends is SECURITY INVOKER

CREATE OR REPLACE FUNCTION public.analytics_rollup_day(p_day date, p_snapshot boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  inst      record;
  day_start timestamptz;
  day_end   timestamptz;
  n         integer := 0;
  k         integer;
BEGIN
  FOR inst IN SELECT id, timezone FROM institutions ORDER BY id LOOP
    -- one school's bad zone name must not stop the others (AT TIME ZONE raises on an unknown name)
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = inst.timezone) THEN
      RAISE WARNING 'analytics_rollup_day: institution % has unknown timezone %; skipped', inst.id, inst.timezone;
      CONTINUE;
    END IF;
    day_start := p_day::timestamp AT TIME ZONE inst.timezone;
    day_end   := (p_day + 1)::timestamp AT TIME ZONE inst.timezone;

    -- per class: one row per metric for EVERY class of the school that existed by the end of the day,
    -- zeros included, so weekly averages over the rollup never skip a quiet class
    WITH scope AS (SELECT class_id FROM analytics_scope_classes(inst.id, NULL) WHERE created_at < day_end),
    teams AS (SELECT * FROM analytics_scope_teams(inst.id, NULL)),
    channels AS (
      SELECT cv.id, t.class_id, t.project_id
        FROM conversations cv JOIN teams t ON t.project_id = cv.project_id
       WHERE cv.type = 'team_members'),
    day_msgs AS (
      SELECT ch.class_id, ch.project_id
        FROM messages m JOIN channels ch ON ch.id = m.conversation_id
       WHERE m.created_at >= day_start AND m.created_at < day_end),
    day_stories AS (
      SELECT t.class_id, t.project_id, coalesce(us.points, 0) AS points
        FROM user_stories us JOIN teams t ON t.project_id = us.project_id
       WHERE us.created_at >= day_start AND us.created_at < day_end),
    day_tasks AS (
      SELECT t.class_id, t.project_id, coalesce(tk.points, 0) AS points
        FROM tasks tk JOIN teams t ON t.project_id = tk.project_id
       WHERE tk.created_at >= day_start AND tk.created_at < day_end),
    day_moves AS (
      SELECT t.class_id, t.project_id
        FROM task_moves mv JOIN tasks tk ON tk.id = mv.task_id JOIN teams t ON t.project_id = tk.project_id
       WHERE mv.moved_at >= day_start AND mv.moved_at < day_end),
    day_views AS (                                 -- by project, so the team rule applies like every other metric;
      SELECT DISTINCT t.class_id, e.actor_id, e.project_id   -- one row per person and board a day: a refetch is no visit
        FROM events e JOIN teams t ON t.project_id = e.project_id
       WHERE e.kind = 'board_viewed' AND e.occurred_at >= day_start AND e.occurred_at < day_end),
    active_teams AS (
      SELECT DISTINCT class_id, project_id FROM (
        SELECT class_id, project_id FROM day_msgs
        UNION ALL SELECT class_id, project_id FROM day_stories
        UNION ALL SELECT class_id, project_id FROM day_tasks
        UNION ALL SELECT class_id, project_id FROM day_moves) a),
    live AS (SELECT class_id, status, points FROM analytics_live_tasks(inst.id, NULL)),
    metrics AS (
      SELECT s.class_id, 'team_messages'::text AS metric,
             (SELECT count(*) FROM day_msgs d WHERE d.class_id = s.class_id)::numeric AS value FROM scope s
      UNION ALL SELECT s.class_id, 'stories_created',
             (SELECT count(*) FROM day_stories d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'tasks_created',
             (SELECT count(*) FROM day_tasks d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'story_points_created',
             (SELECT coalesce(sum(points), 0) FROM day_stories d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'task_points_created',
             (SELECT coalesce(sum(points), 0) FROM day_tasks d WHERE d.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'active_teams',
             (SELECT count(*) FROM active_teams a WHERE a.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'board_views',
             (SELECT count(*) FROM day_views v WHERE v.class_id = s.class_id) FROM scope s
      UNION ALL SELECT s.class_id, 'teams',          -- as of the day: projects that existed by then with a
             (SELECT count(*) FROM projects p         -- current member who had joined by then (membership
               WHERE p.class_id = s.class_id          -- history is not kept, decision 12, so this is the
                 AND p.created_at < day_end           -- closest honest figure for a backfilled day)
                 AND EXISTS (SELECT 1 FROM project_members pm
                              WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL
                                AND pm.created_at < day_end)) FROM scope s
      UNION ALL
      SELECT s.class_id, m.metric, m.value
        FROM scope s
        CROSS JOIN LATERAL (
          SELECT 'tasks_todo'::text AS metric, count(*) FILTER (WHERE status = 'todo')::numeric AS value
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'tasks_in_progress', count(*) FILTER (WHERE status = 'in_progress')
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'tasks_done', count(*) FILTER (WHERE status = 'done')
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'points_todo', coalesce(sum(points) FILTER (WHERE status = 'todo'), 0)
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'points_in_progress', coalesce(sum(points) FILTER (WHERE status = 'in_progress'), 0)
            FROM live l WHERE l.class_id = s.class_id
          UNION ALL SELECT 'points_done', coalesce(sum(points) FILTER (WHERE status = 'done'), 0)
            FROM live l WHERE l.class_id = s.class_id) m
       WHERE p_snapshot)
    INSERT INTO analytics_daily (institution_id, class_id, day, metric, value)
    SELECT inst.id, class_id, p_day, metric, value FROM metrics
    ON CONFLICT (institution_id, class_id, day, metric)
    DO UPDATE SET value = EXCLUDED.value, computed_at = now();
    GET DIAGNOSTICS k = ROW_COUNT;
    n := n + k;

    -- per institution (class_id NULL): direct messages that count for the school (the rule is
    -- analytics_counted_dm's) and the distinct people of the school who signed in that day
    WITH school_people AS (
      SELECT DISTINCT ur.user_id FROM analytics_user_roles() ur JOIN classes c ON c.id = ur.class_id
       WHERE c.institution_id = inst.id),
    counted_dm AS (SELECT conversation_id AS id FROM analytics_counted_dm(inst.id)),
    metrics AS (
      SELECT 'dm_messages'::text AS metric,
             (SELECT count(*) FROM messages m JOIN counted_dm cd ON cd.id = m.conversation_id
               WHERE m.created_at >= day_start AND m.created_at < day_end)::numeric AS value
      UNION ALL
      SELECT 'active_users',
             (SELECT count(DISTINCT e.actor_id) FROM events e JOIN school_people sp ON sp.user_id = e.actor_id
               WHERE e.kind = 'login' AND e.occurred_at >= day_start AND e.occurred_at < day_end))
    INSERT INTO analytics_daily (institution_id, class_id, day, metric, value)
    SELECT inst.id, NULL, p_day, metric, value FROM metrics
    ON CONFLICT (institution_id, class_id, day, metric)
    DO UPDATE SET value = EXCLUDED.value, computed_at = now();
    GET DIAGNOSTICS k = ROW_COUNT;
    n := n + k;
  END LOOP;
  RETURN n;
END;
$$;

-- Backfill of activity metrics for a closed range; snapshots are skipped (they start at go-live).
CREATE OR REPLACE FUNCTION public.analytics_rollup_range(p_from date, p_to date)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d date;
  n integer := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'analytics_rollup_range: bad range % .. %', p_from, p_to;
  END IF;
  FOR d IN SELECT generate_series(p_from, p_to, interval '1 day')::date LOOP
    n := n + analytics_rollup_day(d, false);
  END LOOP;
  RETURN n;
END;
$$;

-- ------------------------------------------------------------------ trends (from the rollup) ----
-- Weekly rows the backend turns into the Trends panels and the tile sparklines: team messages,
-- tasks created, the week's last points_done snapshot and the week's average team count, summed over
-- the class rows in scope (every class the school ever had, deleted ones included, or the selected
-- class); dm_messages from the institution rows, on days with or without class rows. Weeks start on
-- Monday (days are already calendar days in the school's zone). Covers whole weeks from the Monday of
-- least(p_prev_from, as_of - 84 days, p_to - 84 days) to p_to, so the previous range and a 12-week sparkline both fit
-- and the first bucket is never a partial week.
CREATE OR REPLACE FUNCTION public.analytics_trends(
  p_institution uuid, p_class uuid, p_from date, p_to date,
  p_prev_from date, p_prev_to date, p_tz text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH as_of AS (SELECT max(day) AS d FROM analytics_daily WHERE institution_id = p_institution),
  lo AS (SELECT date_trunc('week', least(coalesce(p_prev_from, p_from),
                                        coalesce((SELECT d FROM as_of), p_from) - 84,
                                        p_to - 84)::timestamp)::date AS d),
  -- class rows of every class the school ever had (a deleted class keeps its rows: that is the point
  -- of the rollup), or of the one selected class
  class_rows AS (
    SELECT ad.day, ad.metric, ad.value
      FROM analytics_daily ad
     WHERE ad.institution_id = p_institution AND ad.class_id IS NOT NULL
       AND (p_class IS NULL OR ad.class_id = p_class)
       AND ad.day >= (SELECT d FROM lo) AND ad.day <= p_to),
  inst_rows AS (
    SELECT ad.day, ad.metric, ad.value
      FROM analytics_daily ad
     WHERE ad.institution_id = p_institution AND ad.class_id IS NULL
       AND ad.day >= (SELECT d FROM lo) AND ad.day <= p_to),
  daily_class AS (
    SELECT day,
           sum(value) FILTER (WHERE metric = 'team_messages') AS team_messages,
           sum(value) FILTER (WHERE metric = 'tasks_created') AS tasks_created,
           sum(value) FILTER (WHERE metric = 'points_done')   AS points_done,
           sum(value) FILTER (WHERE metric = 'teams')         AS teams
      FROM class_rows GROUP BY day),
  daily_inst AS (
    SELECT day, sum(value) FILTER (WHERE metric = 'dm_messages') AS dm_messages
      FROM inst_rows GROUP BY day),
  daily AS (                                      -- a day with DMs but no class rows still counts
    SELECT coalesce(c.day, i.day) AS day, c.team_messages, c.tasks_created, c.points_done, c.teams, i.dm_messages
      FROM daily_class c FULL OUTER JOIN daily_inst i ON i.day = c.day),
  weekly AS (
    SELECT date_trunc('week', d.day::timestamp)::date AS week_start,
           coalesce(sum(d.team_messages), 0) AS team_messages,
           coalesce(sum(d.tasks_created), 0) AS tasks_created,
           (array_agg(d.points_done ORDER BY d.day DESC) FILTER (WHERE d.points_done IS NOT NULL))[1] AS points_done,
           avg(d.teams) AS teams,
           coalesce(sum(d.dm_messages), 0) AS dm_messages
      FROM daily d
     GROUP BY 1)
  SELECT jsonb_build_object(
    'as_of', (SELECT d FROM as_of),
    'weekly', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'week_start', week_start, 'team_messages', team_messages, 'tasks_created', tasks_created,
                'points_done', points_done, 'teams', teams, 'dm_messages', dm_messages)
                ORDER BY week_start) FROM weekly), '[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.analytics_rollup_day(date, boolean)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_rollup_range(date, date)                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_trends(uuid, uuid, date, date, date, date, text)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_rollup_day(date, boolean)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_rollup_range(date, date)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_trends(uuid, uuid, date, date, date, date, text)     TO service_role;
