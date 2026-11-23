-- NutriLift — lược đồ đồng bộ cho Supabase.
-- Cách dùng: Supabase Dashboard → SQL Editor → New query → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần vẫn an toàn.

create sequence if not exists public.nl_rev_seq;

create table if not exists public.nl_records (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text    not null,
  id         text    not null,
  data       jsonb   not null default '{}'::jsonb,
  updated_at bigint  not null,              -- thời điểm sửa trên thiết bị (ms)
  deleted    boolean not null default false,
  rev        bigint  not null default nextval('public.nl_rev_seq'),  -- số thứ tự thay đổi trên máy chủ
  primary key (user_id, tbl, id)
);

create index if not exists nl_records_user_rev on public.nl_records (user_id, rev);

-- Last-write-wins: bỏ qua bản ghi cũ hơn bản đang lưu; mỗi lần ghi nhận số rev mới.
create or replace function public.nl_records_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.rev := nextval('public.nl_rev_seq');
  return new;
end;
$$;

drop trigger if exists nl_records_before_write on public.nl_records;
create trigger nl_records_before_write
  before insert or update on public.nl_records
  for each row execute function public.nl_records_before_write();

-- Row Level Security: mỗi người chỉ đọc/ghi dữ liệu của chính mình.
alter table public.nl_records enable row level security;

drop policy if exists "nl_records_select_own" on public.nl_records;
create policy "nl_records_select_own" on public.nl_records
  for select using (auth.uid() = user_id);

drop policy if exists "nl_records_insert_own" on public.nl_records;
create policy "nl_records_insert_own" on public.nl_records
  for insert with check (auth.uid() = user_id);

drop policy if exists "nl_records_update_own" on public.nl_records;
create policy "nl_records_update_own" on public.nl_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "nl_records_delete_own" on public.nl_records;
create policy "nl_records_delete_own" on public.nl_records
  for delete using (auth.uid() = user_id);

grant usage on sequence public.nl_rev_seq to authenticated;
grant select, insert, update, delete on public.nl_records to authenticated;

-- (Tuỳ chọn) Realtime: thiết bị khác nhận thay đổi gần như tức thì.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.nl_records;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
