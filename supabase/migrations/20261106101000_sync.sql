-- أنشئ سجلاً موحداً لكل عنصر مزامنة، مع ملكية المستخدم وعلامة الحذف.
create table public.sync_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  primary key (user_id, kind, id)
);

-- سرّع جلب عناصر كل مستخدم بترتيب وقت التحديث.
create index sync_items_user_updated_at_idx on public.sync_items (user_id, updated_at);

-- فعّل أمان الصفوف حتى لا تُتاح العناصر خارج السياسات المعرّفة أدناه.
alter table public.sync_items enable row level security;

-- اسمح للمستخدم المصادق بقراءة عناصره فقط.
create policy sync_items_select_own on public.sync_items
  for select to authenticated
  using (auth.uid() = user_id);

-- اسمح للمستخدم المصادق بإدخال عناصر مملوكة له فقط.
create policy sync_items_insert_own on public.sync_items
  for insert to authenticated
  with check (auth.uid() = user_id);

-- اسمح للمستخدم المصادق بتحديث عناصره فقط، مع التحقق من الملكية بعد التحديث أيضاً.
create policy sync_items_update_own on public.sync_items
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- اسمح للمستخدم المصادق بحذف عناصره فقط.
create policy sync_items_delete_own on public.sync_items
  for delete to authenticated
  using (auth.uid() = user_id);

-- أنشئ حاوية الملفات خاصة، أو أبقها خاصة إذا كانت موجودة مسبقاً.
insert into storage.buckets (id, name, public)
values ('vexale-files', 'vexale-files', false)
on conflict (id) do update set public = false;

-- اسمح بقراءة ملفات الحاوية فقط عندما يطابق أول مجلد معرّف المستخدم الحالي.
create policy vexale_files_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vexale-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- اسمح بإضافة ملفات داخل مجلد المستخدم الحالي فقط.
create policy vexale_files_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vexale-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- اسمح بتحديث ملفات المستخدم الحالي فقط، مع إعادة فحص المسار بعد التحديث.
create policy vexale_files_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vexale-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vexale-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- اسمح بحذف ملفات المستخدم الحالي فقط.
create policy vexale_files_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vexale-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
