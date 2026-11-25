-- Attire categories: Formals, Casual Shirts, Jean Pants, Casual T-shirts, Polo T-shirts, Street Wear (the older four stay valid for Elite pieces).
alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (category in ('formal', 'wedding', 'statement', 'shirts', 'formals', 'casual-shirts', 'jeans', 'casual-tees', 'polo-tees', 'streetwear'));
